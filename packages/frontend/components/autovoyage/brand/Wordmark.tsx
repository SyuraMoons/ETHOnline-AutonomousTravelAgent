// Wordmark
import Link from "next/link";
import { WaypointLogo, type WaypointVariant } from "./WaypointLogo";

export function Wordmark({
  variant = "onLight",
  href = "/",
  size = 28,
}: {
  variant?: WaypointVariant;
  href?: string;
  size?: number;
}) {
  const textColor = variant === "onDark" ? "text-av-paper" : "text-av-ink";
  return (
    <Link href={href} className="flex items-center gap-2 select-none no-underline" aria-label="AutoVoyage home">
      <WaypointLogo variant={variant} size={size} />
      <span className={`font-semibold text-[20px] md:text-[22px] leading-none tracking-[-0.01em] ${textColor}`}>
        AutoVoyage
      </span>
    </Link>
  );
}
