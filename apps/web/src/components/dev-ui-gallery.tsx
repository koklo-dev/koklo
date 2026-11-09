import { DevUiAgent } from "./dev-ui-agent.tsx";
import { SURFACES, TYPE_SCALE } from "./dev-ui-data.ts";
import { DevUiFrame, DevUiSection } from "./dev-ui-frame.tsx";
import { DevUiIdea } from "./dev-ui-idea.tsx";
import { DevUiLists } from "./dev-ui-lists.tsx";
import { DevUiListsB } from "./dev-ui-lists-b.tsx";
import { DevUiNav } from "./dev-ui-nav.tsx";
import { DevUiSurfacesB } from "./dev-ui-overlays.tsx";
import { DevUiOverview } from "./dev-ui-overview.tsx";
import { DevUiPrimitivesA } from "./dev-ui-primitives-a.tsx";
import { DevUiPrimitivesB } from "./dev-ui-primitives-b.tsx";
import { DevUiPrimitivesC } from "./dev-ui-primitives-c.tsx";
import { DevUiShell } from "./dev-ui-shell.tsx";
import { DevUiSignature } from "./dev-ui-signature.tsx";
import { DevUiStatuses } from "./dev-ui-statuses.tsx";
import { DevUiSurfacesA } from "./dev-ui-surfaces.tsx";
import { DevUiSurfacesC } from "./dev-ui-tables.tsx";
import { DevUiThemeSwitch } from "./dev-ui-theme-switch.tsx";

function Surfaces() {
  return (
    <DevUiSection id="dev-ui-surfaces" title="1. Surfaces et élévation">
      <DevUiFrame title="Jetons de surface">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SURFACES.map((s) => (
            <li key={s.token} className="flex flex-col gap-1.5">
              <span className={`h-12 rounded-lg border ${s.swatch}`} />
              <span className="text-caption">{s.role}</span>
              <span className="font-mono text-code text-muted-foreground">{s.token}</span>
            </li>
          ))}
        </ul>
      </DevUiFrame>
      <DevUiFrame title="Élément flottant">
        <div className="rounded-[10px] border bg-raised p-4 shadow-floating">
          <p className="text-caption">Élevé avec ombre</p>
          <p className="font-mono text-code text-muted-foreground">--raised · --shadow-floating</p>
        </div>
      </DevUiFrame>
    </DevUiSection>
  );
}

function TypeScale() {
  return (
    <DevUiSection id="dev-ui-type" title="2. Échelle typographique">
      <DevUiFrame title="Rôles de DESIGN.md §3" wide>
        <dl className="flex flex-col gap-3">
          {TYPE_SCALE.map((row) => (
            <div
              key={row.spec}
              className="flex flex-col gap-1 md:grid md:grid-cols-[240px_1fr] md:items-baseline md:gap-4"
            >
              <dt className="text-meta text-muted-foreground">{row.spec}</dt>
              <dd>
                <p className={row.className}>{row.sample}</p>
              </dd>
            </div>
          ))}
        </dl>
      </DevUiFrame>
    </DevUiSection>
  );
}

/** Galerie `/dev/ui` (fiche S-dev-ui) : chaque jeton et chaque composant du lot 0, dans tous ses états. */
export function DevUiGallery() {
  return (
    <div className="min-h-svh bg-surface">
      <header className="flex flex-col gap-3 border-b bg-background px-4 py-5 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex flex-col gap-1">
          <p className="text-group-label uppercase text-muted-foreground">Lot 0 · DESIGN.md v2</p>
          <h1 className="text-page-title">Galerie des composants</h1>
          <p className="text-meta text-muted-foreground">
            Chaque jeton et chaque composant de <code className="font-mono">@koklo/ui</code>, dans
            tous ses états.
          </p>
        </div>
        <DevUiThemeSwitch />
      </header>
      <main className="mx-auto flex max-w-[1120px] flex-col gap-10 px-4 py-8 md:px-8">
        <Surfaces />
        <TypeScale />
        <DevUiStatuses />
        <DevUiSignature />
        <DevUiLists />
        <DevUiListsB />
        <DevUiShell />
        <DevUiNav />
        <DevUiPrimitivesA />
        <DevUiPrimitivesB />
        <DevUiPrimitivesC />
        <DevUiSurfacesA />
        <DevUiSurfacesB />
        <DevUiSurfacesC />
        <DevUiIdea />
        <DevUiAgent />
        <DevUiOverview />
      </main>
    </div>
  );
}
