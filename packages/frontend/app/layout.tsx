import "@scaffold-hbar-ui/components/styles.css";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "AutoVoyage",
  description: "Risk-aware autonomous travel agent: plans, pays via x402, and stops at a face check.",
});

/**
 * Root layout: html/body + theme only. The wallet/x402 providers (and the scaffold Header/Footer)
 * are intentionally NOT global — they belong to the product `(app)` route group so the marketing
 * pages render clean and provider-free (FRONTEND.md §2). The remaining scaffold demo routes
 * (debug/blockexplorer/agent) will get their own providers layout when we build the (app) shell.
 */
const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning>
      <body>
        <ThemeProvider enableSystem>{children}</ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
