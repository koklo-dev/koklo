import type { Metadata } from "next";
import { LoginForm } from "../../components/login-form.tsx";
import { ThemeToggle } from "../../components/theme-toggle.tsx";

export const metadata: Metadata = { title: "Connexion · Koklo" };

export default function LoginPage() {
  return (
    <main
      data-testid="login-page"
      className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10"
    >
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </main>
  );
}
