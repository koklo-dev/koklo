"use client";

import { Badge, Button, Card, Icon, type IconName } from "@koklo/ui";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { ROLE_LABELS } from "../lib/roles.ts";
import { type InvitationState, useInvitation } from "../lib/use-invitation.ts";
import { BrandMark } from "./brand-mark.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { LoadingStatus } from "./loading-status.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

type Invitation = ReturnType<typeof useInvitation>;

const FULL_WIDTH = "h-11 w-full md:h-9";

function Title({ children }: { children: ReactNode }) {
  return (
    <h1 tabIndex={-1} className="text-[24px] font-semibold tracking-[-0.015em] outline-none">
      {children}
    </h1>
  );
}

function ProjectsLink({ children = "Aller à mes projets" }: { children?: string }) {
  return (
    <Button asChild variant="outline" className={FULL_WIDTH}>
      <a href="/projects">{children}</a>
    </Button>
  );
}

function Status({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      <Icon name={icon} size={20} />
      <Title>{title}</Title>
      <p className="text-[13px] text-muted-foreground">{text}</p>
    </div>
  );
}

type ReadyState = Extract<InvitationState, { kind: "ready" }>;

function Ready({ api, state }: { api: Invitation; state: ReadyState }) {
  const { preview } = state;
  const who = preview.inviterEmail ? `${preview.inviterEmail} vous invite` : "Vous êtes invité(e)";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Title>Rejoindre {preview.organizationName}</Title>
        {/* `div` et non `p` : le Badge du kit est un `div`, interdit dans un paragraphe. */}
        <div className="text-[13px] text-muted-foreground">
          {who} à rejoindre cette organisation avec le rôle{" "}
          <Badge variant="outline">{ROLE_LABELS[preview.role] ?? preview.role}</Badge>.
        </div>
      </div>
      {state.failed ? (
        <ErrorNotice onRetry={() => void api.accept(preview)}>{GENERIC_ERROR}</ErrorNotice>
      ) : null}
      <Button
        className={FULL_WIDTH}
        disabled={state.busy}
        aria-busy={state.busy}
        onClick={() => void api.accept(preview)}
      >
        {state.busy ? "Acceptation…" : "Accepter l'invitation"}
      </Button>
    </div>
  );
}

type MemberState = Extract<InvitationState, { kind: "member" }>;

function Member({ api, state }: { api: Invitation; state: MemberState }) {
  const { busy, organizationId } = state;
  return (
    <div className="flex flex-col gap-6">
      <Status
        icon="check_circle"
        title="Vous faites déjà partie de cette organisation"
        text="Il n'y a rien à accepter."
      />
      <Button
        className={FULL_WIDTH}
        disabled={busy}
        aria-busy={busy}
        onClick={() => void api.openProjects(organizationId)}
      >
        Ouvrir mes projets
      </Button>
    </div>
  );
}

function Wrong({ api }: { api: Invitation }) {
  return (
    <div className="flex flex-col gap-6">
      <Title>Cette invitation est destinée à une autre adresse</Title>
      <ErrorNotice>
        Vous êtes connecté(e) avec {api.email}. Déconnectez-vous puis reconnectez-vous avec le
        compte GitHub dont l'adresse a reçu l'invitation.
      </ErrorNotice>
      <Button className={FULL_WIDTH} onClick={() => void api.signOut()}>
        <Icon name="logout" size={20} />
        Se déconnecter
      </Button>
      <ProjectsLink />
    </div>
  );
}

function Invalid() {
  return (
    <div className="flex flex-col gap-6">
      <Title>Cette invitation n'est plus valide</Title>
      <ErrorNotice>
        Elle a peut-être expiré (elles durent 7 jours), été annulée ou déjà été acceptée. Demandez
        un nouveau lien à la personne qui vous a invité(e).
      </ErrorNotice>
      <ProjectsLink />
    </div>
  );
}

function Failed({ api }: { api: Invitation }) {
  return (
    <div className="flex flex-col gap-6">
      <Title>Impossible de continuer</Title>
      <ErrorNotice onRetry={() => void api.load()}>{GENERIC_ERROR}</ErrorNotice>
    </div>
  );
}

function body(api: Invitation): ReactNode {
  const { state } = api;
  switch (state.kind) {
    case "loading":
      return <LoadingStatus label="Chargement de l'invitation…" rows={2} rowClassName="h-10" />;
    case "ready":
      return <Ready api={api} state={state} />;
    case "success":
      return (
        <Status
          icon="check_circle"
          title={`Bienvenue dans ${state.preview.organizationName}`}
          text="Ouverture de vos projets…"
        />
      );
    case "member":
      return <Member api={api} state={state} />;
    case "wrong":
      return <Wrong api={api} />;
    case "invalid":
      return <Invalid />;
    case "error":
      return <Failed api={api} />;
  }
}

/** Les états qui montrent l'adresse de session et « Se déconnecter » en pied de carte. */
const WITH_FOOTER = new Set<InvitationState["kind"]>(["ready", "member", "invalid", "error"]);

function Footer({ api }: { api: Invitation }) {
  if (!api.email || !WITH_FOOTER.has(api.state.kind)) return null;
  return (
    <div className="flex flex-col items-start gap-1 border-t pt-4 md:flex-row md:items-center md:justify-between">
      <p className="break-words text-[13px] text-muted-foreground">
        Connecté en tant que {api.email}
      </p>
      <Button variant="ghost" className="h-11 md:h-9" onClick={() => void api.signOut()}>
        Se déconnecter
      </Button>
    </div>
  );
}

/** Clé de vue : le focus revient sur le titre à chaque changement, pas pendant l'acceptation. */
function viewKey(state: InvitationState): string {
  return state.kind === "ready" && state.failed ? "ready-failed" : state.kind;
}

/** Acceptation d'une invitation (`/accept-invitation/<id>`) : aperçu au destinataire, clic explicite, cas d'erreur sans fuite. */
export function AcceptInvitationPage({ invitationId }: { invitationId: string }) {
  const api = useInvitation(invitationId);
  const card = useRef<HTMLDivElement>(null);
  const view = viewKey(api.state);
  // biome-ignore lint/correctness/useExhaustiveDependencies: le focus suit le changement de vue
  useLayoutEffect(() => {
    card.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [view]);
  return (
    <main
      data-testid="accept-invitation-page"
      className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-4 md:p-10"
    >
      <ThemeToggle className="absolute top-4 right-4" />
      <BrandMark />
      <Card ref={card} className="w-full max-w-md gap-6 p-6">
        {body(api)}
        <Footer api={api} />
      </Card>
    </main>
  );
}
