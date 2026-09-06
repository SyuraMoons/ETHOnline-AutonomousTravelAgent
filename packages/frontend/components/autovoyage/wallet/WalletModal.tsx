"use client";

// Wallet modal
import { CoinbaseGlyph, MetaMaskGlyph, WalletConnectGlyph } from "./walletGlyphs";

const WALLETS = [
  { name: "MetaMask", desc: "Browser extension", glyph: MetaMaskGlyph, badge: "Popular" },
  { name: "WalletConnect", desc: "Scan with your phone", glyph: WalletConnectGlyph },
  { name: "Coinbase Wallet", desc: "Connect via Coinbase", glyph: CoinbaseGlyph },
] as const;

export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-av-ink/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-[440px] rounded-lg border border-av-border bg-av-card p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold text-av-text">Connect your wallet</h2>
            <p className="m-0 mt-0.5 text-[13px] text-av-muted">Choose a wallet to authorize x402 payments.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-av-border text-[15px] text-av-muted transition-colors hover:bg-av-bg"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {WALLETS.map(w => (
            <button
              key={w.name}
              type="button"
              onClick={() => {
                console.info("[AutoVoyage] connect wallet (stub):", w.name);
              }}
              className="flex items-center gap-3 rounded border border-av-border px-4 py-3 text-left transition-colors hover:bg-av-bg"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-av-blue-tint text-av-blue">
                <w.glyph size={18} />
              </span>
              <span className="flex-1">
                <span className="block text-[14px] font-semibold text-av-text">{w.name}</span>
                <span className="block text-[12px] text-av-muted">{w.desc}</span>
              </span>
              {"badge" in w && w.badge ? (
                <span className="rounded bg-av-blue-tint px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-av-blue">
                  {w.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <p className="mt-5 text-[12px] leading-relaxed text-av-muted">
          By connecting, you authorize autonomous x402 payments up to your set limit.
        </p>
      </div>
    </div>
  );
}
