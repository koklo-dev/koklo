import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "../components/providers.tsx";
import { THEME_INIT_SCRIPT } from "../lib/theme.ts";
import "./globals.css";

export const metadata: Metadata = { title: "Koklo" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script>{THEME_INIT_SCRIPT}</script>
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
