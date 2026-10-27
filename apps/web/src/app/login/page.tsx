import type { Metadata } from "next";
import { BrandMark } from "../../components/brand-mark.tsx";
import { LoginCard } from "../../components/login-card.tsx";
import { ThemeToggle } from "../../components/theme-toggle.tsx";

export const metadata: Metadata = { title: "Connexion · Koklo" };

/** Page de connexion (bloc shadcn `login-05`) : colonne centrée, logo au-dessus de la carte. */
export default function LoginPage() {
  return (
    <main
      data-testid="login-page"
      className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-muted p-4 md:p-10"
    >
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-semibold">
          <BrandMark />
          Koklo
        </div>
        <LoginCard />
      </div>
    </main>
  );
}
