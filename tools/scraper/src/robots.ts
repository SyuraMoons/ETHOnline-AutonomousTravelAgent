// robots.txt fetching and matching.
//
// This is a hard gate, not a formality: if a rule disallows the path we are
// about to request, the run refuses and names the rule. Written by hand rather
// than pulled from a package because the matching rules are twenty lines and a
// dependency here would be harder to audit than the code it replaces.

import { log } from "./log.js";

interface Rule {
  kind: "allow" | "disallow";
  pattern: string;
}

const cache = new Map<string, Rule[]>();

class NotRobotsError extends Error {}

/** Real robots.txt is plain text built from directives; HTML never is. */
function looksLikeRobots(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed === "") return true; // an empty file is a valid "no rules"
  if (/^\s*<(!doctype|html|head|script)/i.test(trimmed)) return false;
  return /^\s*(user-agent|disallow|allow|sitemap|crawl-delay)\s*:/im.test(trimmed);
}

/** www.example.com -> example.com; leaves a bare registrable domain alone. */
function parentOrigin(origin: string): string | null {
  const { protocol, host } = new URL(origin);
  const labels = host.split(".");
  if (labels.length <= 2) return null;
  const parent = labels.slice(1).join(".");
  if (parent.split(".").length < 2) return null;
  return `${protocol}//www.${parent}`;
}

/** Parses only the `User-agent: *` group — we never impersonate a named crawler. */
function parseRules(text: string): Rule[] {
  const rules: Rule[] = [];
  let inStarGroup = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]!.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      inStarGroup = value === "*";
    } else if (inStarGroup && (key === "allow" || key === "disallow") && value) {
      rules.push({ kind: key, pattern: value });
    }
  }
  return rules;
}

/** robots.txt wildcards: `*` matches any sequence, a trailing `$` anchors the end. */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

export async function loadRobots(origin: string): Promise<Rule[]> {
  const cached = cache.get(origin);
  if (cached) return cached;

  let rules: Rule[] = [];
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const body = await response.text();

      // A 200 that is not actually robots.txt means something intercepted the
      // request — usually a JS bot challenge served as HTML. Parsing that finds
      // no Disallow lines and would conclude "everything is permitted", which
      // is the most dangerous possible reading. Detect it and fail closed.
      if (!looksLikeRobots(body)) {
        throw new NotRobotsError(
          `${origin}/robots.txt returned ${body.length} bytes that are not robots.txt ` +
            `(likely a bot-challenge page). Refusing to infer permission from it.`,
        );
      }

      rules = parseRules(body);
      log.detail(`robots.txt: ${rules.length} rules for User-agent: *`);
    } else {
      // No robots.txt is a grant, not a denial, per the standard.
      log.detail(`robots.txt returned ${response.status} — treating as no restrictions`);
    }
  } catch (error) {
    if (error instanceof NotRobotsError) {
      // The host is challenging us. Its published policy still lives on the
      // registrable parent domain, so consult that rather than either guessing
      // or giving up — and say out loud that this is what happened.
      const parent = parentOrigin(origin);
      if (parent) {
        log.warn(`${new URL(origin).host} served a challenge instead of robots.txt`);
        log.warn(`falling back to ${new URL(parent).host}/robots.txt for the published rules`);
        rules = await loadRobots(parent);
        cache.set(origin, rules);
        return rules;
      }
      throw error;
    }
    // A network failure must not be read as permission. Fail closed.
    throw new Error(
      `Could not fetch ${origin}/robots.txt (${error instanceof Error ? error.message : String(error)}). ` +
        `Refusing to scrape a host whose rules we could not read.`,
    );
  }

  cache.set(origin, rules);
  return rules;
}

export interface RobotsVerdict {
  allowed: boolean;
  rule?: string;
}

/** Longest-match wins; `allow` wins ties, per the de-facto standard. */
export function checkPath(rules: Rule[], path: string): RobotsVerdict {
  let best: { length: number; kind: "allow" | "disallow"; pattern: string } | null = null;
  for (const rule of rules) {
    if (!matches(rule.pattern, path)) continue;
    const length = rule.pattern.replace(/\$$/, "").length;
    if (!best || length > best.length || (length === best.length && rule.kind === "allow")) {
      best = { length, kind: rule.kind, pattern: rule.pattern };
    }
  }
  if (!best) return { allowed: true };
  return { allowed: best.kind === "allow", rule: `${best.kind}: ${best.pattern}` };
}

/** Throws if the URL is disallowed, naming the exact rule that blocked it. */
export async function assertAllowed(url: string): Promise<void> {
  const parsed = new URL(url);
  const rules = await loadRobots(parsed.origin);
  const verdict = checkPath(rules, parsed.pathname + parsed.search);
  if (!verdict.allowed) {
    throw new Error(
      `robots.txt disallows ${parsed.pathname} on ${parsed.host} (rule: ${verdict.rule}). ` +
        `Pick a different site rather than working around this.`,
    );
  }
}

// A plain, honest desktop UA. We do not rotate it, randomise it, or pretend to
// be a search engine — if a site does not want this traffic, the answer is to
// stop, not to disguise it.
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
