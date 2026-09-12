// Waypoint logo
export type WaypointVariant = "onLight" | "onDark";

const PALETTE: Record<WaypointVariant, { route: string; ring: string }> = {
  onLight: { route: "#0B0B0C", ring: "#C2603F" },
  onDark: { route: "#F5F4F1", ring: "#DC7C55" },
};

export function WaypointLogo({
  variant = "onLight",
  size = 28,
  className,
}: {
  variant?: WaypointVariant;
  size?: number;
  className?: string;
}) {
  const { route, ring } = PALETTE[variant];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="AutoVoyage"
    >

      <circle cx="5" cy="22" r="2.6" fill={route} />

      <path d="M5 22 C 5 13, 14 12, 21 10" stroke={route} strokeWidth="2" strokeLinecap="round" />

      <circle cx="23" cy="9" r="5.2" stroke={ring} strokeWidth="2.4" />
      <circle cx="23" cy="9" r="1.4" fill={ring} />
    </svg>
  );
}
