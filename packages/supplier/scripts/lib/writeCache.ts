// Validate, dedupe, sort, and write one cache file plus its provenance.
//
// Shared by every generator so the guarantees are identical across domains:
// nothing is written unless it matches the shared schema and every id is
// unique. A malformed row must fail here, at generation time, rather than
// reaching a buyer who has already paid for it.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/lib -> scripts -> supplier -> packages -> repo root
export const CACHE_DIR = path.resolve(__dirname, "../../../../data/cache");

export interface WriteCacheOptions<T> {
  /** Basename: "hotels" writes hotels.json and hotels.meta.json. */
  name: string;
  rows: T[];
  schema: z.ZodType<T>;
  /** Uniqueness key. A collision means two different things share an id. */
  idOf: (row: T) => string;
  sort: (a: T, b: T) => number;
  /** Recorded alongside the data so a stale cache is obvious. */
  meta: Record<string, unknown>;
  dryRun?: boolean;
}

export interface WriteCacheResult<T> {
  rows: T[];
  file: string;
}

export function writeCache<T>(
  options: WriteCacheOptions<T>,
): WriteCacheResult<T> {
  const { name, rows, schema, idOf, sort, meta, dryRun = false } = options;

  const issues: string[] = [];
  const valid: T[] = [];
  for (const [index, row] of rows.entries()) {
    const parsed = schema.safeParse(row);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      issues.push(
        `row ${index}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      );
    }
  }
  if (issues.length > 0) {
    throw new Error(
      `${name}: ${issues.length} row(s) do not match the schema — nothing written.\n  ` +
        issues.slice(0, 8).join("\n  "),
    );
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of valid) {
    const id = idOf(row);
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size > 0) {
    // An id collision would let two different things share a booking and,
    // later, share an approval.
    throw new Error(
      `${name}: duplicate id(s), nothing written: ${[...duplicates].slice(0, 5).join(", ")}`,
    );
  }

  // Sorted so the committed file has a stable diff between regenerations.
  const sorted = [...valid].sort(sort);
  const file = path.join(CACHE_DIR, `${name}.json`);

  if (!dryRun) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
    writeFileSync(
      path.join(CACHE_DIR, `${name}.meta.json`),
      `${JSON.stringify({ ...meta, generatedAt: new Date().toISOString(), rowCount: sorted.length }, null, 2)}\n`,
    );
  }

  return { rows: sorted, file };
}
