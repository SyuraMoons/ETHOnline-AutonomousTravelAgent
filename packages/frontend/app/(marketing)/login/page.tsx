// Login page
import Image from "next/image";
import Link from "next/link";
import { SignInCard } from "~~/components/autovoyage/marketing/SignInCard";
import { Wordmark } from "~~/components/autovoyage/brand/Wordmark";

export default function LoginPage() {
  return (
    <div className="flex min-h-svh w-full">

      <div className="relative hidden w-[42%] max-w-[620px] overflow-hidden lg:block">
        <Image
          src="/brand/login-panel.png"
          alt=""
          fill
          priority
          sizes="42vw"
          className="object-cover [filter:saturate(0.5)_brightness(0.9)]"
        />

        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(11,11,12,0.94) 0%, rgba(11,11,12,0.4) 18%, rgba(11,11,12,0.4) 50%, rgba(11,11,12,0.98) 86%, rgba(11,11,12,0.99) 100%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-8">
          <Wordmark variant="onDark" />
          <div>
            <h2 className="max-w-[420px] text-[clamp(30px,3vw,42px)] font-semibold leading-[1.08] tracking-[-0.02em] text-av-paper">
              Plan and book your whole trip, hands-free.
            </h2>
            <p className="mt-3 max-w-[380px] text-[15px] leading-relaxed text-av-paper/70">
              AutoVoyage acts within the limits you set, and asks for a confirm before anything that costs.
            </p>
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col bg-av-paper">
        <div className="px-6 pt-6 md:px-10">
          <Link
            href="/"
            className="text-[14px] font-medium text-av-muted no-underline transition-opacity hover:opacity-70"
          >
            ← Back to home
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <SignInCard />
        </div>

        <div className="px-6 pb-6 text-right md:px-10">
          <p className="m-0 text-[12px] text-av-muted">
            © 2026 AutoVoyage · <Link href="/" className="no-underline hover:opacity-70">Privacy</Link> ·{" "}
            <Link href="/" className="no-underline hover:opacity-70">Terms</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
