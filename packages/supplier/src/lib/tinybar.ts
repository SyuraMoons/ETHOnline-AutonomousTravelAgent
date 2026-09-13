/**
 * HBAR / tinybar helpers for x402 payments.
 *
 * Copied from packages/frontend/utils/x402.ts rather than imported — that
 * package is a Next.js app, this is a standalone Express service, and the two
 * should not share a runtime dependency across that boundary.
 */

/** Tinybars in one HBAR. */
export const TINYBAR_PER_HBAR = 100_000_000n;

/**
 * Parse an HBAR string (e.g. from env config) into tinybars.
 *
 * @throws When more than 8 decimal places are supplied (sub-tinybar precision).
 */
export function hbarToTinybar(hbar: string): bigint {
  const trimmed = hbar.trim();
  if (!trimmed) return 0n;
  if (!/^\d*\.?\d*$/.test(trimmed))
    throw new Error(`Invalid HBAR amount: ${hbar}`);

  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > 8)
    throw new Error(`HBAR supports at most 8 decimal places: ${hbar}`);

  const paddedFraction = fraction.padEnd(8, "0");
  return (
    BigInt(whole || "0") * TINYBAR_PER_HBAR + BigInt(paddedFraction || "0")
  );
}

/** Clamp a tinybar amount between two HBAR-string bounds (inclusive). */
export function clampTinybar(
  amount: bigint,
  minHbar: string,
  maxHbar: string,
): bigint {
  const min = hbarToTinybar(minHbar);
  const max = hbarToTinybar(maxHbar);
  if (amount < min) return min;
  if (amount > max) return max;
  return amount;
}
