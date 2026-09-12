// Currency formatting (USD / USDC)
export function formatUsd(minor: number): string {
  const dollars = minor / 100;
  const hasCents = minor % 100 !== 0;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatUsdc(amount: number): string {
  return `${amount.toFixed(2)} USDC`;
}
