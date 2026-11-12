import type { IncomingMessage } from "node:http";

/**
 * Faux API du panneau d'édition (TK-101, contrat 2.11.0) : `spec.item.get`, `spec.refs.search` et
 * `ai.prefillItem`. Piloté par le scénario : `validated` (livrable Fonctionnel validé), `references` (éléments qui
 * citent la fonctionnalité) et `prefill` (`ok` ou `notConfigured`). Aucun appel ne part vers un fournisseur d'IA.
 */
export type PrefillMode = "ok" | "notConfigured";
export type SpecItemScenario = { validated?: boolean; references?: boolean; prefill?: PrefillMode };

type Reply = { status: number; body: string };
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });

/** Éléments proposables ; `R-0987` n'est dans aucune page chargée (autocomplétion sur élément non chargé). */
const CATALOG = [
  { kind: "screen", specId: "S-liste-attente", title: "Liste d'attente" },
  { kind: "screen", specId: "S-reservation", title: "Réservation" },
  { kind: "rule", specId: "R-001", title: "Un créneau, une réservation" },
  { kind: "rule", specId: "R-087", title: "Acompte des longues prestations" },
  { kind: "rule", specId: "R-0987", title: "Règle du jeu de volume" },
  { kind: "table", specId: "T-client", title: "Client" },
  { kind: "endpoint", specId: "E-connexion", title: "Connexion" },
];

const REFERENCES = {
  items: [
    { kind: "rule", specId: "R-004", title: "Annulation tardive" },
    { kind: "flow", specId: "P-annuler", title: "Annuler ou déplacer" },
  ],
  total: 2,
};

const PREFILLED = {
  type: "feature",
  values: {
    title: "Liste d'attente",
    priority: "should",
    description:
      "Quand aucun créneau n'est libre, le client laisse son téléphone et il est prévenu par SMS dès qu'un créneau se libère.",
    criteria: [
      {
        title: "Inscription en liste d'attente",
        steps: [
          { type: "etant_donne", text: "aucun créneau n'est libre à l'heure demandée" },
          { type: "quand", text: "le client laisse son numéro de téléphone" },
          { type: "alors", text: "il est ajouté à la liste d'attente de ce créneau" },
        ],
      },
    ],
    links: ["R-001", "S-reservation"],
  },
};

function refsSearch(url: URL): Reply {
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const items = CATALOG.filter(
    (item) => !q || item.specId.toLowerCase().startsWith(q) || item.title.toLowerCase().includes(q),
  ).slice(0, 20);
  return reply(200, { items });
}

function readBody(req: IncomingMessage, done: () => void): void {
  req.on("data", () => undefined);
  req.on("end", done);
}

interface Handlers {
  send: (reply: Reply) => void;
}

/** Répond aux trois routes du panneau, `false` pour toute autre. `feature` produit la réponse de `spec.getFeature`. */
export function handleSpecItem(
  req: IncomingMessage,
  url: URL,
  h: Handlers,
  scenario: SpecItemScenario,
  feature: (specId: string) => Reply,
): boolean {
  const item = /^\/projects\/[^/]+\/spec\/items\/feature\/(F-\d+)$/.exec(url.pathname);
  if (req.method === "GET" && item) {
    const specId = item[1] as string;
    const read = feature(specId);
    h.send(
      read.status === 200
        ? reply(200, {
            type: "feature",
            id: specId,
            values: JSON.parse(read.body),
            validated: scenario.validated ?? false,
            referencedBy: scenario.references ? REFERENCES : { items: [], total: 0 },
          })
        : read,
    );
    return true;
  }
  if (req.method === "GET" && /^\/projects\/[^/]+\/spec\/refs$/.test(url.pathname)) {
    h.send(refsSearch(url));
    return true;
  }
  if (req.method === "POST" && /^\/projects\/[^/]+\/ai\/item\/prefill$/.test(url.pathname)) {
    readBody(req, () =>
      h.send(
        scenario.prefill === "notConfigured"
          ? reply(409, {
              defined: true,
              code: "LLM_NOT_CONFIGURED",
              message: "LLM_NOT_CONFIGURED",
              data: { reason: "missing" },
            })
          : reply(200, PREFILLED),
      ),
    );
    return true;
  }
  return false;
}
