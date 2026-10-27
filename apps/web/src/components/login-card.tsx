"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Icon,
} from "@koklo/ui";
import { useState } from "react";
import { authClient } from "../lib/auth-client.ts";
import { BrandMark } from "./brand-mark.tsx";

type Status = "idle" | "redirecting" | "failed";

export function LoginCard() {
  const [status, setStatus] = useState<Status>("idle");

  async function signIn(): Promise<void> {
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
    <Card className="w-full max-w-[400px]">
      <CardHeader>
        <BrandMark />
        <h1 className="text-[24px] font-semibold tracking-[-0.015em]">Connexion à Koklo</h1>
        <CardDescription>
          Connectez-vous avec votre compte GitHub pour accéder à vos projets.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === "failed" ? (
          <Alert variant="destructive">
            <Icon name="warning" size={20} />
            <AlertDescription>La connexion avec GitHub a échoué. Réessayez.</AlertDescription>
          </Alert>
        ) : null}
        <Button className="h-11 w-full md:h-9" disabled={busy} aria-busy={busy} onClick={signIn}>
          <Icon name="lock" size={20} />
          {busy ? "Redirection vers GitHub…" : "Continuer avec GitHub"}
        </Button>
      </CardContent>
    </Card>
  );
}
