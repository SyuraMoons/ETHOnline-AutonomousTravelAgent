// Fonts (Rubik, JetBrains Mono)
import { JetBrains_Mono, Rubik } from "next/font/google";

export const rubik = Rubik({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rubik",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jbmono",
  display: "swap",
});

export const fontVars = `${rubik.variable} ${jetbrainsMono.variable}`;
