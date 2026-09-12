// Prepares packages/supplier/.env without the signing key ever passing through
// a terminal, a clipboard, or scrollback.
//
//   npm run supplier:setup-env -- --payTo 0.0.12345
//
// gen-signing-key.ts prints the private key for you to copy. That works, but a
// secret on stdout ends up in scrollback, and from there in screen shares and
// pasted logs. This writes it straight into the file and prints only the public
// half, which is the part you actually need to read (it verifies booking
// signatures and is served on the agent card anyway).
//
// Safe to re-run: existing values are kept unless --force is passed, so it will
// not silently rotate a key the supplier is already signing with.

import { generateKeyPairSync } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(__dirname, "..");
const ENV_FILE = path.join(PKG, ".env");
const EXAMPLE = path.join(PKG, ".env.example");

/** Replaces KEY=... in place, preserving comments and ordering. */
function setValue(contents: string, key: string, value: string): string {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(contents))
    return contents.replace(pattern, `${key}=${value}`);
  return `${contents.trimEnd()}\n${key}=${value}\n`;
}

function currentValue(contents: string, key: string): string | null {
  const match = new RegExp(`^${key}=(.*)$`, "m").exec(contents);
  const value = match?.[1]?.trim() ?? "";
  // Case-insensitive: the example ships 0.0.xxxxxx, but a hand-edited file often
  // ends up as 0.0.XXXXX, which would otherwise be accepted as a real account.
  if (!value || /x{3,}/i.test(value)) return null;
  return value;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      payTo: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });

  if (!existsSync(ENV_FILE)) {
    copyFileSync(EXAMPLE, ENV_FILE);
    console.log(`[setup-env] created packages/supplier/.env from the example`);
  }

  let contents = readFileSync(ENV_FILE, "utf-8");
  let publicKeyB64: string | null = null;

  const existingKey = currentValue(contents, "SUPPLIER_SIGNING_KEY");
  if (existingKey && !values.force) {
    console.log(
      "[setup-env] SUPPLIER_SIGNING_KEY already set — left alone (--force to rotate)",
    );
  } else {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    // Written straight to the file: the private half is never printed.
    contents = setValue(
      contents,
      "SUPPLIER_SIGNING_KEY",
      privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
    );
    publicKeyB64 = publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64");
    console.log(
      `[setup-env] ${existingKey ? "rotated" : "generated"} SUPPLIER_SIGNING_KEY (written to .env, not shown)`,
    );
  }

  if (values.payTo) {
    contents = setValue(contents, "PAY_TO", values.payTo);
    console.log(`[setup-env] PAY_TO set to ${values.payTo}`);
  }

  writeFileSync(ENV_FILE, contents);

  if (publicKeyB64) {
    console.log(
      `\n  Public key (verifies BookingResponse.signature; also served on the agent card):`,
    );
    console.log(`  ${publicKeyB64}\n`);
  }

  const payTo = currentValue(contents, "PAY_TO");
  if (!payTo) {
    console.log(
      "[setup-env] PAY_TO is still unset — this is the Hedera account that RECEIVES buyer payments.",
    );
    console.log(
      "            It is not the facilitator account, which only pays transaction fees.",
    );
    console.log(
      "            Re-run with: npm run supplier:setup-env -- --payTo 0.0.xxxxx",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`[setup-env] ready — payTo ${payTo}. Next: npm run preflight`);
}

try {
  main();
} catch (error) {
  console.error("[setup-env]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
