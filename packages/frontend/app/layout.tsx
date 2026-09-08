// Root layout
import "@scaffold-hbar-ui/components/styles.css";
import { ThemeProvider } from "~~/components/ThemeProvider";
import { AppProviders } from "~~/components/autovoyage/layout/AppProviders";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "AutoVoyage",
  description: "Risk-aware autonomous travel agent: plans, pays via x402, and stops at a face check.",
});

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <ThemeProvider enableSystem>
          <AppProviders>{children}</AppProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
