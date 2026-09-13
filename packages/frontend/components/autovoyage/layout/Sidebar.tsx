"use client";

// Sidebar
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "../brand/Wordmark";
import { CompassIcon, MapPinIcon, PulseIcon, ShieldIcon } from "../ui/icons";
import { BudgetCard } from "./BudgetCard";
import { ProfileBar } from "./ProfileBar";

const NAV = [
  { href: "/plan", label: "Plan trip", icon: CompassIcon },
  { href: "/itinerary", label: "My trips", icon: MapPinIcon },
  { href: "/activity", label: "Activity", icon: PulseIcon },
  { href: "/audit", label: "Audit", icon: ShieldIcon },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-svh w-[236px] flex-shrink-0 flex-col gap-6 self-start overflow-y-auto border-r border-av-border bg-av-card px-4 py-5">
      <div className="px-1">
        <Wordmark href="/plan" />
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          // "/itinerary/:bookingId" should highlight "My trips" too, not just an exact match.
          const active = pathname === href || (href !== "/plan" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded px-3 py-2 text-[14px] font-medium no-underline transition-colors ${
                active ? "bg-av-blue-tint text-av-blue" : "text-av-muted hover:bg-av-bg"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <BudgetCard />

      <ProfileBar />
    </aside>
  );
}
