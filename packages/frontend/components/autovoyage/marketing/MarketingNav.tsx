// Marketing nav
import Link from "next/link";
import { Wordmark } from "../brand/Wordmark";

export function MarketingNav({ onDark = false }: { onDark?: boolean }) {
  const linkColor = onDark ? "text-av-paper" : "text-av-text";

  return (
    <nav className="flex items-center justify-between px-6 pt-6 md:px-10">
      <Wordmark variant={onDark ? "onDark" : "onLight"} />
      <div className="flex items-center gap-3 md:gap-5">
        <Link
          href="/login"
          className={`hidden text-[15px] font-medium no-underline transition-opacity hover:opacity-60 sm:inline ${linkColor}`}
        >
          Log in
        </Link>
        <Link
          href="/login"
          className="rounded bg-av-blue px-4 py-2 text-[15px] font-medium text-av-paper no-underline transition-colors hover:bg-av-blue-hover"
        >
          Get started
        </Link>
      </div>
    </nav>
  );
}
