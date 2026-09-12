// Marketing layout
import type { ReactNode } from "react";
import { JetBrains_Mono, Rubik } from "next/font/google";

const rubik = Rubik({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rubik",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jbmono",
  display: "swap",
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${rubik.variable} ${jetbrainsMono.variable} min-h-svh bg-av-paper text-av-text`}
      style={{ fontFamily: "var(--font-rubik), ui-sans-serif, system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}
