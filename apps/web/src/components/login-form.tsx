"use client";

import {
  Alert,
  AlertDescription,
  Button,
  cn,
  Field,
  FieldDescription,
  FieldGroup,
  Icon,
} from "@koklo/ui";
import { useState } from "react";
import { authClient } from "../lib/auth-client.ts";
import { BrandMark } from "./brand-mark.tsx";

type Status = "idle" | "redirecting" | "failed";

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const [status, setStatus] = useState<Status>("idle");

  async function signIn(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setStatus("redirecting");
    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: "/projects",
      });
      if (result?.error) setStatus("failed");
    } catch {
      setStatus("failed");
    }
  }

  const busy = status === "redirecting";
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={signIn}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <BrandMark />
            <h1 className="text-[24px] font-semibold tracking-[-0.015em]">Connexion à Koklo</h1>
            <FieldDescription>
              Connectez-vous avec votre compte GitHub pour accéder à vos projets.
            </FieldDescription>
          </div>
          {status === "failed" ? (
            <Alert variant="destructive">
              <Icon name="warning" size={20} />
              <AlertDescription>La connexion avec GitHub a échoué. Réessayez.</AlertDescription>
            </Alert>
          ) : null}
          <Field>
            <Button type="submit" className="h-11 w-full md:h-9" disabled={busy} aria-busy={busy}>
              <Icon name="lock" size={20} />
              {busy ? "Redirection vers GitHub…" : "Continuer avec GitHub"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        Vous serez redirigé vers GitHub pour vous authentifier.
      </FieldDescription>
    </div>
  );
}
