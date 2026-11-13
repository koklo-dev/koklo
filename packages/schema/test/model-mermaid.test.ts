import { describe, expect, it } from "vitest";
import { emitModelMermaid, type TableV2 } from "../src/index.ts";

/** TK-107 lot A (B384) : `data/model.mmd`, texte Mermaid déterministe généré depuis les tables. */
const client: TableV2 = {
  id: "T-client",
  nom: "Client",
  champs: [
    { nom: "id", type: "uuid", cle: "primaire" },
    { nom: "nom", type: "texte(80)" },
    { nom: "age", type: "entier" },
    { nom: "solde", type: "decimal" },
    { nom: "actif", type: "booleen" },
    { nom: "cree_le", type: "horodatage" },
    { nom: "ne_le", type: "date" },
    { nom: "statut", type: "enum", valeurs: ["a", "b"] },
    { nom: "extra", type: "json" },
  ],
};
const reservation: TableV2 = {
  id: "T-reservation",
  nom: "Réservation",
  champs: [
    { nom: "id", type: "uuid", cle: "primaire" },
    { nom: "client_id", type: "ref(T-client)" },
  ],
  relations: [{ vers: "T-client", cardinalite: "n → 1" }],
};

describe("emitModelMermaid", () => {
  it("rend un erDiagram avec types Mermaid et PK / FK", () => {
    const text = emitModelMermaid([client, reservation]);
    expect(text.startsWith("%%")).toBe(true);
    expect(text).toContain("erDiagram");
    expect(text).toContain("T_client {");
    expect(text).toContain("uuid id PK");
    expect(text).toContain("string nom");
    expect(text).toContain("int age");
    expect(text).toContain("decimal solde");
    expect(text).toContain("bool actif");
    expect(text).toContain("timestamp cree_le");
    expect(text).toContain("date ne_le");
    expect(text).toContain("enum statut");
    expect(text).toContain("json extra");
    expect(text).toContain("uuid client_id FK");
    expect(text.endsWith("\n")).toBe(true);
  });

  it.each([
    ["1 → n", "||--o{"],
    ["n → 1", "}o--||"],
    ["1 → 1", "||--||"],
    ["1 → 0..1", "||--o|"],
    ["n ↔ n", "}o--o{"],
  ] as const)("cardinalité %s : %s, étiquette = la cardinalité", (cardinalite, glyph) => {
    const a: TableV2 = { ...reservation, relations: [{ vers: "T-client", cardinalite }] };
    expect(emitModelMermaid([client, a])).toContain(
      `T_reservation ${glyph} T_client : "${cardinalite}"`,
    );
  });

  it("sortie déterministe : indépendante de l'ordre d'entrée, idempotente", () => {
    const one = emitModelMermaid([client, reservation]);
    expect(emitModelMermaid([reservation, client])).toBe(one);
    expect(emitModelMermaid([client, reservation])).toBe(one);
  });

  it("aucune table : diagramme vide valide", () => {
    expect(emitModelMermaid([])).toContain("erDiagram");
  });

  it("PK et FK sur un même champ : `PK, FK`", () => {
    const t: TableV2 = {
      id: "T-profil",
      nom: "Profil",
      champs: [{ nom: "client_id", type: "ref(T-client)", cle: "primaire" }],
    };
    expect(emitModelMermaid([t])).toContain("uuid client_id PK, FK");
  });

  it("clé étrangère sans relation déclarée : relation n → 1 déduite, jamais en double (B476)", () => {
    const tache: TableV2 = {
      id: "T-tache",
      nom: "Tâche",
      champs: [
        { nom: "id", type: "uuid", cle: "primaire" },
        { nom: "client_id", type: "ref(T-client)" },
        { nom: "autre_client_id", type: "ref(T-client)" },
        { nom: "parent_id", type: "ref(T-tache)" },
      ],
    };
    const text = emitModelMermaid([client, tache, reservation]);
    expect(text.match(/T_tache }o--\|\| T_client : "n → 1"/g)).toHaveLength(1);
    expect(text).not.toContain("T_tache }o--|| T_tache");
    expect(text.match(/T_reservation \S+ T_client/g)).toHaveLength(1);
  });
});
