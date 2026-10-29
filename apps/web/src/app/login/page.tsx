import type { Metadata } from "next";
import { use } from "react";
import { LoginForm } from "../../components/login-form.tsx";
import { ThemeToggle } from "../../components/theme-toggle.tsx";

export const metadata: Metadata = { title: "Connexion · Koklo" };

/** `next` : destination de retour après connexion, validée en liste blanche par `LoginForm`. */
export default function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string | string[] }>;
}) {
  const { next } = searchParams ? use(searchParams) : { next: undefined };
  return (
    <main
      data-testid="login-page"
      className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10"
    >
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
