import { act, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { FramingPage } from "../../src/components/framing-page.tsx";
import type { ProposedFeature } from "../../src/lib/framing-types.ts";
import { serveWrite } from "./feature-form.tsx";
import { inputsOf, PROJECT_ID, type Role } from "./features.tsx";
import { renderWithQuery } from "./render.tsx";
import { findNamed } from "./wait.ts";
import { procedures, setUrl } from "./web-mocks.ts";

/**
 * Support des tests de l'écran de cadrage (TK-59 / 59a et 59b). Les `vi.mock` restent dans chaque fichier
 * (voir features.tsx). Contrat des libellés et des sélecteurs : .workflow/TK-59/02-decisions.md.
 */
export const META = {
  provider: "anthropic",
  model: "claude-test-1",
  usage: { inputTokens: 812, outputTokens: 344 },
} as const;

export const BRIEF_OUTPUT = {
  brief: {
    title: "Portail de réservation",
    problem: "Les clients appellent l'accueil pour réserver.",
    users: "Clients et personnel d'accueil.",
    expectedOutcome: "Réserver en ligne en moins de deux minutes.",
    constraints: "Mobile d'abord.",
    openQuestions: ["Faut-il un paiement en ligne ?", "Quels créneaux sont proposés ?"],
  },
  meta: META,
};

type StepType = ProposedFeature["criteria"][number]["steps"][number]["type"];
export const step = (type: StepType, text: string) => ({ type, text });
export const criterion = (title: string, text = title) => ({
  title,
  steps: [
    step("etant_donne", `un contexte ${text}`),
    step("quand", `l'action ${text}`),
    step("alors", `le résultat ${text}`),
  ],
});
export const feature = (
  title: string,
  priority: ProposedFeature["priority"] = "must",
  over: Partial<ProposedFeature> = {},
): ProposedFeature => ({
  kind: "feature.create",
  title,
  priority,
  description: `Description de ${title}.\nSeconde ligne.`,
  criteria: [criterion(`Cas nominal de ${title}`), criterion(`Cas d'erreur de ${title}`)],
  ...over,
});
export const T1 = "Réserver un créneau";
export const T2 = "Annuler une réservation";
export const T3 = "Rappel par SMS";
export const PROPOSALS_OUTPUT = {
  features: [feature(T1, "must"), feature(T2, "should"), feature(T3, "could")],
  duplicates: [{ index: 2, specId: "F-003" }],
  meta: META,
};

export const IDEA = "Un portail pour réserver des créneaux en ligne.";
export const PASTED_BRIEF = "Titre : Portail\nProblème : réserver est long.";

/** Équipe qui écrit, spec lue, `ai.*` simulés : à appeler dans `beforeEach` après `resetWebMocks()`. */
export function serveFraming(role: Role = "owner"): void {
  serveWrite(role);
  procedures.aiDraftBrief.mockResolvedValue(BRIEF_OUTPUT);
  procedures.aiProposeFeatures.mockResolvedValue(PROPOSALS_OUTPUT);
}

export function renderFraming(projectId = PROJECT_ID) {
  setUrl(`/projects/${projectId}/framing`);
  return renderWithQuery(<FramingPage projectId={projectId} />);
}

/** Rend la page et attend l'étape 1 (champ « Votre idée »). */
export async function openFraming(projectId = PROJECT_ID) {
  const view = renderFraming(projectId);
  await findNamed("heading", "Cadrage", { level: 1 });
  await ideaField();
  return view;
}

export const ideaField = (): Promise<HTMLElement> =>
  findNamed("textbox", /^Votre idée/, { text: /Votre idée/ });
export const GENERATE = "Générer un brief avec l'IA";
export const PROPOSE = "Proposer des fonctionnalités avec l'IA";
export const regionOf = (name: string | RegExp): HTMLElement =>
  screen.getByRole("region", { name });
export const stepTwo = () => within(regionOf(/Le brief/));
export const stepThree = () => within(regionOf(/Les propositions/));

export async function paste(field: HTMLElement, value: string) {
  await userEvent.clear(field);
  await userEvent.click(field);
  if (value) await userEvent.paste(value);
}
export async function writeIdea(value = IDEA) {
  await paste(await ideaField(), value);
}

/** Écrit l'idée et génère le brief ; attend l'étape 2. */
export async function generateBrief(idea = IDEA) {
  await writeIdea(idea);
  await userEvent.click(screen.getByRole("button", { name: GENERATE }));
  await findNamed("heading", /^2\. Le brief/, { level: 2 });
}
/** Brief produit puis propositions demandées ; attend l'étape 3. */
export async function proposeFeatures() {
  await generateBrief();
  await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
  await findNamed("heading", /^3\. Les propositions/, { level: 2 });
  await findNamed("heading", T1, { level: 3 });
}

/** La carte (`li`) d'une proposition, par son titre. */
export function card(title: string): HTMLElement {
  const item = screen.getByRole("heading", { name: title, level: 3 }).closest("li");
  if (!item) throw new Error(`Aucune carte pour « ${title} »`);
  return item;
}
export const inCard = (title: string) => within(card(title));
export const accept = (title: string) =>
  userEvent.click(inCard(title).getByRole("button", { name: "Accepter" }));
export const reject = (title: string) =>
  userEvent.click(inCard(title).getByRole("button", { name: "Rejeter" }));
export const edit = (title: string) =>
  userEvent.click(inCard(title).getByRole("button", { name: "Modifier" }));

export const SAVE = /^Enregistrer \d+ fonctionnalités?$/;
export const saveBar = () => screen.queryByRole("button", { name: SAVE });
export const CONFIRM_GROUP = "Confirmer l'enregistrement";
export async function askConfirmation() {
  await userEvent.click(screen.getByRole("button", { name: SAVE }));
  return within(await screen.findByRole("group", { name: CONFIRM_GROUP }));
}

/** Appels `ai.*` reçus (corps), dans l'ordre. */
export const briefCalls = () => inputsOf(procedures.aiDraftBrief);
export const proposeCalls = () => inputsOf(procedures.aiProposeFeatures);
export const aiCallCount = (): number =>
  procedures.aiDraftBrief.mock.calls.length + procedures.aiProposeFeatures.mock.calls.length;
export const submits = () => inputsOf(procedures.specBatchSubmit);

/** Région d'état unique de la page. */
export const liveRegion = (): HTMLElement => screen.getByRole("status");
export const liveText = (): string => (liveRegion().textContent ?? "").replace(/\s+/g, " ");

/** Laisse passer les microtâches (réponses simulées) puis les effets. */
export const flush = () => act(async () => void (await Promise.resolve()));
export { waitFor };
