import type { Metadata } from "next";
import { LoginCard } from "../../components/login-card.tsx";
import { ThemeToggle } from "../../components/theme-toggle.tsx";

export const metadata: Metadata = { title: "Connexion · Koklo" };

export default function LoginPage() {
  return (
    <main
      data-testid="login-page"
      className="relative flex min-h-screen items-center justify-center p-4"
    >
      <ThemeToggle className="absolute top-4 right-4" />
      <LoginCard />
    </main>
  );
}
