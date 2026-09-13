// Checks every precondition for taking a real payment, in dependency order, and
// says exactly what is wrong and how to fix it.
//
//   npm run preflight
//
// Written because each failure on the way up is opaque on its own — a missing
// env var surfaces as a stack trace, an unfunded account surfaces as a failed
// settlement minutes later, and a facilitator that is down surfaces as
// "no supported payment kinds". Stops at the first blocker, because the checks
// after it would only fail for the same reason.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../..");

const MIRROR =
  process.env["MIRROR_NODE_URL"] ?? "https://testnet.mirrornode.hedera.com";
const FACILITATOR_URL =
  process.env["FACILITATOR_URL"] ?? "http://localhost:4020";
const SUPPLIER_URL = process.env["PUBLIC_BASE_URL"] ?? "http://localhost:4100";

/** Minimum balance worth starting a demo with. Each settlement costs a fraction of this. */
const MIN_BALANCE_HBAR = 5;

type Result =
  { ok: true; detail?: string } | { ok: false; problem: string; fix: string[] };

interface Check {
  group: string;
  name: string;
  run: () => Promise<Result> | Result;
}

/** Reads a .env without importing dotenv's side effects into this process. */
function readEnvFile(relative: string): Record<string, string> | null {
  const file = path.join(REPO, relative);
  if (!existsSync(file)) return null;
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

function envCheck(
  relative: string,
  required: string[],
  exampleHint: string,
): Result {
  const env = readEnvFile(relative);
  if (!env) {
    return {
      ok: false,
      problem: `${relative} does not exist`,
      fix: [
        `cp ${relative}.example ${relative}`,
        `then fill in: ${required.join(", ")}`,
        exampleHint,
      ],
    };
  }
  const missing = required.filter((name) => {
    const value = env[name];
    // Case-insensitive: the example ships 0.0.xxxxxx, but a hand-edited file
    // often ends up as 0.0.XXXXX, which sailed through as a real account id.
    return !value || value === "" || /x{3,}/i.test(value);
  });
  if (missing.length > 0) {
    return {
      ok: false,
      problem: `${relative} is missing or has placeholder values for: ${missing.join(", ")}`,
      fix: [`edit ${relative}`, exampleHint],
    };
  }
  return { ok: true, detail: `${required.length} required vars set` };
}

async function reachable(
  url: string,
  timeoutMs = 4000,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const CHECKS: Check[] = [
  {
    group: "Data",
    name: "Generated caches present",
    run: () => {
      const missing = ["flights", "hotels", "activities"].filter(
        (name) => !existsSync(path.join(REPO, "data/cache", `${name}.json`)),
      );
      if (missing.length > 0) {
        return {
          ok: false,
          problem: `missing cache: ${missing.join(", ")}`,
          fix: ["npm run data:generate"],
        };
      }
      const counts = ["flights", "hotels", "activities"].map((name) => {
        const rows = JSON.parse(
          readFileSync(path.join(REPO, "data/cache", `${name}.json`), "utf-8"),
        ) as unknown[];
        return `${rows.length} ${name}`;
      });
      return { ok: true, detail: counts.join(", ") };
    },
  },
  {
    group: "Credentials",
    name: "Root .env — facilitator fee payer",
    run: () =>
      envCheck(
        ".env",
        ["FACILITATOR_ACCOUNT_ID", "FACILITATOR_PRIVATE_KEY"],
        "get a funded ECDSA testnet account from portal.hedera.com",
      ),
  },
  {
    group: "Credentials",
    name: "Supplier .env — payee and signing key",
    run: () =>
      envCheck(
        "packages/supplier/.env",
        ["PAY_TO", "SUPPLIER_SIGNING_KEY"],
        "generate the signing key with: npm run supplier:gen-signing-key",
      ),
  },
  {
    group: "Credentials",
    name: "Facilitator account is funded",
    run: async () => {
      const env = readEnvFile(".env");
      const accountId = env?.["FACILITATOR_ACCOUNT_ID"];
      if (!accountId)
        return {
          ok: false,
          problem: "no FACILITATOR_ACCOUNT_ID to check",
          fix: ["fill in the root .env first"],
        };
      try {
        const response = await fetch(`${MIRROR}/api/v1/accounts/${accountId}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          return {
            ok: false,
            problem: `mirror node does not know account ${accountId} (HTTP ${response.status})`,
            fix: [
              "check the account id",
              "an account only appears after it is funded",
            ],
          };
        }
        const payload = (await response.json()) as {
          balance?: { balance?: number };
        };
        const tinybars = payload.balance?.balance ?? 0;
        const hbar = tinybars / 1e8;
        if (hbar < MIN_BALANCE_HBAR) {
          return {
            ok: false,
            problem: `${accountId} holds ${hbar.toFixed(2)} HBAR, below the ${MIN_BALANCE_HBAR} HBAR floor`,
            fix: [
              "top it up at portal.hedera.com",
              "the facilitator pays the fee for every settlement",
            ],
          };
        }
        return {
          ok: true,
          detail: `${accountId} holds ${hbar.toFixed(2)} HBAR`,
        };
      } catch (error) {
        return {
          ok: false,
          problem: `could not reach the mirror node: ${error instanceof Error ? error.message : String(error)}`,
          fix: [
            "check network access",
            `or set MIRROR_NODE_URL if you use a different one`,
          ],
        };
      }
    },
  },
  {
    group: "Services",
    name: "Facilitator is up",
    run: async () => {
      const result = await reachable(`${FACILITATOR_URL}/health`);
      if (!result.ok) {
        return {
          ok: false,
          problem: `${FACILITATOR_URL}/health unreachable${result.error ? ` (${result.error})` : ` (HTTP ${result.status})`}`,
          fix: [
            "npm run infra:up",
            "needs Docker running",
            "npm run infra:logs to see why it did not start",
          ],
        };
      }
      try {
        const health = (await (
          await fetch(`${FACILITATOR_URL}/health`, {
            signal: AbortSignal.timeout(4000),
          })
        ).json()) as {
          feePayer?: string;
          mode?: string;
        };
        return {
          ok: true,
          detail: `${FACILITATOR_URL} · mode ${health.mode} · feePayer ${health.feePayer}`,
        };
      } catch {
        return { ok: true, detail: FACILITATOR_URL };
      }
    },
  },
  {
    group: "Services",
    name: "Supplier is up",
    run: async () => {
      const result = await reachable(`${SUPPLIER_URL}/health`);
      if (!result.ok) {
        return {
          ok: false,
          problem: `${SUPPLIER_URL}/health unreachable${result.error ? ` (${result.error})` : ` (HTTP ${result.status})`}`,
          fix: [
            "npm run supplier:dev",
            "it refuses to start until the facilitator is up and its .env is complete",
          ],
        };
      }
      return { ok: true, detail: SUPPLIER_URL };
    },
  },
  {
    group: "Services",
    name: "Agent card advertises every service",
    run: async () => {
      try {
        const response = await fetch(`${SUPPLIER_URL}/.well-known/x402`, {
          signal: AbortSignal.timeout(4000),
        });
        const card = (await response.json()) as {
          services?: { id: string }[];
          payTo?: string;
        };
        const ids = (card.services ?? []).map((service) => service.id);
        // The running supplier reads its config once, at startup. A .env edited
        // afterwards leaves the file correct and the live card stale — which is
        // exactly how a payment ends up addressed to 0.0.XXXXX while every other
        // check reports green.
        const configured = readEnvFile("packages/supplier/.env")?.["PAY_TO"];
        if (card.payTo && /x{3,}/i.test(card.payTo)) {
          return {
            ok: false,
            problem: `the running supplier is serving payTo ${card.payTo}, a placeholder`,
            fix: [
              "restart it so it picks up packages/supplier/.env",
              "npm run supplier:dev",
            ],
          };
        }
        if (configured && card.payTo && configured !== card.payTo) {
          return {
            ok: false,
            problem: `.env says PAY_TO=${configured} but the running supplier serves ${card.payTo}`,
            fix: [
              "the supplier is running with stale config — restart it",
              "npm run supplier:dev",
            ],
          };
        }
        if (ids.length < 4) {
          return {
            ok: false,
            problem: `card lists ${ids.length} service(s): ${ids.join(", ") || "none"}`,
            fix: [
              "expected flight-search, flight-booking, stay-search, activity-search",
            ],
          };
        }
        return { ok: true, detail: `payTo ${card.payTo} · ${ids.join(", ")}` };
      } catch (error) {
        return {
          ok: false,
          problem: String(error),
          fix: ["is the supplier up?"],
        };
      }
    },
  },
  {
    group: "Payment",
    name: "Every paid route challenges with a price",
    run: async () => {
      const routes = [
        [
          "flights",
          "/v1/flights/search?origin=SIN&destination=NRT&departDate=2026-11-12",
        ],
        [
          "stays",
          "/v1/stays/search?city=NRT&checkIn=2026-11-12&checkOut=2026-11-15",
        ],
        [
          "activities",
          "/v1/activities/search?city=DPS&date=2026-11-13&pace=calm",
        ],
      ] as const;
      const priced: string[] = [];
      for (const [name, route] of routes) {
        try {
          const response = await fetch(`${SUPPLIER_URL}${route}`, {
            signal: AbortSignal.timeout(6000),
          });
          if (response.status !== 402) {
            return {
              ok: false,
              problem: `${name} returned HTTP ${response.status}, expected 402`,
              fix: ["check the route is registered in src/index.ts"],
            };
          }
          // The challenge rides in the PAYMENT-REQUIRED header, base64-encoded;
          // the body is empty. Reading the body reported every route as free,
          // which looked like a broken supplier rather than a broken check.
          const header = response.headers.get("payment-required");
          if (!header) {
            return {
              ok: false,
              problem: `${name} returned 402 with no PAYMENT-REQUIRED header`,
              fix: [
                "check the x402 server wiring in src/services/x402/server.ts",
              ],
            };
          }
          const challenge = JSON.parse(
            Buffer.from(header, "base64").toString("utf-8"),
          ) as {
            accepts?: { amount?: string; payTo?: string }[];
          };
          const tinybars = Number(challenge.accepts?.[0]?.amount ?? 0);
          if (!Number.isFinite(tinybars) || tinybars <= 0) {
            return {
              ok: false,
              problem: `${name} quoted ${challenge.accepts?.[0]?.amount ?? "nothing"}`,
              fix: ["a priced route should never quote zero"],
            };
          }
          priced.push(`${name} ${(tinybars / 1e8).toFixed(2)}`);
        } catch (error) {
          return {
            ok: false,
            problem: `${name}: ${error instanceof Error ? error.message : String(error)}`,
            fix: ["is the supplier up?"],
          };
        }
      }
      return { ok: true, detail: `${priced.join(" · ")} HBAR` };
    },
  },
  {
    group: "Payment",
    name: "Supplier and facilitator agree on the fee payer",
    run: async () => {
      // The supplier fetches the facilitator's supported kinds ONCE, at startup,
      // and repeats the fee payer it learned in every 402. Change
      // FACILITATOR_ADVERTISED_FEE_PAYER and restart only the facilitator and
      // the two disagree silently — the buyer signs for one fee payer while the
      // facilitator expects another, and the payment is rejected far downstream
      // with a message that says nothing about staleness.
      let advertised: string | undefined;
      try {
        const health = (await (
          await fetch(`${FACILITATOR_URL}/health`, {
            signal: AbortSignal.timeout(4000),
          })
        ).json()) as {
          feePayer?: string;
        };
        advertised = health.feePayer;
      } catch {
        return {
          ok: false,
          problem: "could not read the facilitator's health",
          fix: ["is it up?"],
        };
      }

      const probe = `${SUPPLIER_URL}/v1/stays/search?city=NRT&checkIn=2026-11-12&checkOut=2026-11-15`;
      let served: string | undefined;
      try {
        const response = await fetch(probe, {
          signal: AbortSignal.timeout(6000),
        });
        const header = response.headers.get("payment-required");
        if (!header)
          return {
            ok: false,
            problem: "no PAYMENT-REQUIRED header to inspect",
            fix: ["check the x402 wiring"],
          };
        const challenge = JSON.parse(
          Buffer.from(header, "base64").toString("utf-8"),
        ) as {
          accepts?: { extra?: { feePayer?: string } }[];
        };
        served = challenge.accepts?.[0]?.extra?.feePayer;
      } catch (error) {
        return {
          ok: false,
          problem: String(error),
          fix: ["is the supplier up?"],
        };
      }

      if (advertised && served && advertised !== served) {
        return {
          ok: false,
          problem: `the facilitator pays as ${advertised} but the supplier still advertises ${served}`,
          fix: [
            "the supplier cached this at startup — restart it",
            "npm run supplier:dev",
          ],
        };
      }
      return { ok: true, detail: `both on ${served}` };
    },
  },
  {
    group: "Payment",
    name: "Buyer credentials for the first real purchase",
    run: () => {
      const missing = ["BUYER_ACCOUNT_ID", "BUYER_PRIVATE_KEY"].filter(
        (name) => !process.env[name],
      );
      if (missing.length > 0) {
        return {
          ok: false,
          problem: `${missing.join(", ")} not set in this shell`,
          fix: [
            "these are the AGENT's account, not the facilitator's — it is the one spending",
            'RESOURCE_URL="http://localhost:4100/v1/stays/search?city=NRT&checkIn=2026-11-12&checkOut=2026-11-15" \\',
            "  BUYER_ACCOUNT_ID=0.0.xxxx BUYER_PRIVATE_KEY=0x... npm run x402:buy",
          ],
        };
      }
      return {
        ok: true,
        detail: `buying as ${process.env["BUYER_ACCOUNT_ID"]}`,
      };
    },
  },
];

const ESC = "\x1b";
const color = process.stdout.isTTY && !process.env["NO_COLOR"];
const paint = (code: string, text: string) =>
  color ? `${ESC}[${code}m${text}${ESC}[0m` : text;

async function main(): Promise<void> {
  console.log(
    `\n${paint("1", "Bring-up preflight")}  —  everything that must be true before HBAR can move\n`,
  );

  let lastGroup = "";
  let blocker: { check: Check; result: Extract<Result, { ok: false }> } | null =
    null;

  for (const check of CHECKS) {
    if (check.group !== lastGroup) {
      console.log(paint("90", `  ${check.group.toUpperCase()}`));
      lastGroup = check.group;
    }

    if (blocker) {
      console.log(
        `    ${paint("90", "—")}  ${paint("90", check.name)} ${paint("90", "(skipped)")}`,
      );
      continue;
    }

    const result = await check.run();
    if (result.ok) {
      console.log(
        `    ${paint("32", "✓")}  ${check.name}${result.detail ? paint("90", `  ${result.detail}`) : ""}`,
      );
    } else {
      console.log(`    ${paint("31", "✗")}  ${check.name}`);
      blocker = { check, result };
    }
  }

  if (!blocker) {
    console.log(
      `\n${paint("32", "Ready.")} Every precondition holds — a paid request will settle on testnet.\n`,
    );
    return;
  }

  console.log(`\n${paint("31", "Blocked:")} ${blocker.result.problem}\n`);
  console.log("  To fix:");
  for (const step of blocker.result.fix) console.log(`    ${step}`);
  console.log(
    `\n  Later checks were skipped — they would only fail for the same reason.\n`,
  );
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("[preflight]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
