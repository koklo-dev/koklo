import { FeaturesPage } from "../../src/components/features-page.tsx";
import { type Role, serve } from "./features.tsx";
import { renderWithQuery } from "./render.tsx";
import { PROJECT_ID, procedures, setUrl } from "./web-mocks.ts";

/**
 * Support de la vue client du cahier (TK-104, contrat 3.2.0) : sorties `clientSpace.*` et `review.*` simulées, jamais de
 * vraie API. Les `vi.mock` (`next/navigation`, `auth-client`, `orpc`) restent dans chaque fichier de test.
 */
export const feature = (n: number, over: Record<string, unknown> = {}) => ({
  id: `F-${String(n).padStart(3, "0")}`,
  title: `Fonctionnalité ${n}`,
  priority: "must",
  criteriaCount: 2,
  validation: "to_validate",
  previouslyValidated: false,
  openSuggestions: 0,
  ...over,
});

const unit = (units: number, over: Record<string, unknown> = {}) => ({
  count: units,
  units,
  treated: 0,
  toRevise: 0,
  ...over,
});

export const progress = (over: Record<string, unknown> = {}) => ({
  hasClient: true,
  canValidate: true,
  clientFirstName: "Marie",
  validation: "to_validate",
  tabs: {
    features: unit(3),
    flows: unit(2),
    rules: unit(4, { units: 1 }),
    roles: unit(3, { units: 1 }),
  },
  untreated: 7,
  toRevise: 0,
  changed: 0,
  next: { kind: "feature", ref: "F-001" },
  version: "v1",
  ...over,
});

export const featureDetail = (id = "F-001", over: Record<string, unknown> = {}) => ({
  id,
  title: "Réserver un créneau",
  description: "Le client choisit un créneau libre.",
  priority: "must",
  criteria: [
    {
      id: "AC-1",
      title: "Créneau libre",
      steps: [
        { type: "etant_donne", text: "un service de 30 minutes" },
        { type: "quand", text: "le client choisit un créneau" },
        { type: "alors", text: "la réservation est confirmée" },
      ],
    },
  ],
  validation: "to_validate",
  previouslyValidated: false,
  links: [{ id: "R-002", label: "Délai d'annulation" }],
  versionNote: { date: "2026-11-04", label: "a1b2c3d" },
  version: "v-feature",
  ...over,
});

const page = (items: unknown[], over: Record<string, unknown> = {}) => ({
  items,
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: items.length,
  ...over,
});

const step = (label: string, screen?: string) => (screen ? { label, screen } : { label });

export const FLOW = {
  id: "P-reserver",
  title: "Réserver un rendez-vous",
  actor: "Client",
  start: step("Accueil", "S-accueil"),
  steps: [step("Choisir un service")],
  errors: [],
  features: ["F-001"],
  validation: "to_validate",
  previouslyValidated: false,
};

export const RULE = {
  id: "R-001",
  title: "Pas de double réservation",
  type: "contrainte",
  statement: "Un créneau ne porte qu'une réservation.",
  states: [],
  features: ["F-001"],
};

export const ROLES = {
  roles: [
    { id: "RL-client", name: "Client", description: "Réserve." },
    { id: "RL-accueil", name: "Accueil", description: "Gère l'agenda." },
  ],
  actions: [
    {
      specId: "PM-agenda.lire",
      label: "Voir l'agenda",
      resource: "Agenda",
      access: [
        { roleId: "RL-client", level: "denied" },
        { roleId: "RL-accueil", level: "allowed" },
      ],
    },
  ],
  validation: "to_validate",
  previouslyValidated: false,
  version: "v-roles",
};

/** Rôle, projet et lectures du client servis ; chaque test surcharge ce qui l'intéresse. */
export function serveClient(role: Role = "client", over: Record<string, unknown> = {}): void {
  serve(role);
  procedures.clientSpaceProgress.mockResolvedValue(progress(over));
  procedures.clientSpaceFeatures.mockResolvedValue({
    ...page([feature(1), feature(2), feature(3)]),
    version: "v1",
  });
  procedures.clientSpaceFeature.mockResolvedValue(featureDetail());
  procedures.clientSpaceFlows.mockResolvedValue({
    ...page([FLOW, { ...FLOW, id: "P-annuler", title: "Annuler" }]),
    version: "v-flows",
  });
  procedures.clientSpaceRules.mockResolvedValue({
    ...page([RULE]),
    validation: "to_validate",
    previouslyValidated: false,
    version: "v-rules",
  });
  procedures.clientSpaceRoles.mockResolvedValue(ROLES);
  procedures.reviewSubmit.mockResolvedValue({
    id: "01900000-0000-7000-8000-0000000000c1",
    status: "approved",
    validation: "validated",
    createdAt: "2026-11-12T10:00:00.000Z",
  });
  procedures.reviewList.mockResolvedValue({ items: [], nextCursor: null });
}

export function renderClient(search = "") {
  setUrl(`/projects/${PROJECT_ID}/spec/functional${search}`);
  return renderWithQuery(<FeaturesPage projectId={PROJECT_ID} />);
}
