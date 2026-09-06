// Wallet glyphs
type G = { size?: number; className?: string };

export function MetaMaskGlyph({ size = 18, className }: G) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 4l6.5 4.5L8.2 4zM21 4l-6.5 4.5L15.8 4zM6.5 15l2.3 2.8 3.2-1 3.2 1 2.3-2.8-1.8-2.6H8.3z" />
    </svg>
  );
}

export function WalletConnectGlyph({ size = 18, className }: G) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" className={className} aria-hidden>
      <path d="M6 10a8 8 0 0 1 12 0" />
      <path d="M8.5 12.6a4.5 4.5 0 0 1 7 0" />
      <circle cx="12" cy="15.4" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CoinbaseGlyph({ size = 18, className }: G) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
