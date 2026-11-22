import { describe, expect, it } from "vitest";
import {
  type ArchNode,
  type ArchZoneDetail,
  type ArchZoneEntry,
  bandsOf,
  ghostsOf,
  isGhostId,
  layerPositions,
  nodesOf,
  positionsOf,
  relationsOf,
  usesZoneView,
  ZONE_VIEW_ABOVE,
  ZONE_VIEW_LARGE_ABOVE,
  ZONE_VIEW_MIN_ZONES,
  zoneGridPositions,
  zoneNodesOf,
  zoneRelationsOf,
} from "../src/lib/architecture-diagram.ts";

/** TK-112 lot B, cas 7 : couches, nœuds, liens et cartes de zone du schéma (B546, B547). */
const DETAIL: ArchZoneDetail = {
  zone: { id: "Z-rdv", name: "Prise de rendez-vous" },
  components: [
    { specId: "C-web", name: "Application web", type: "app" },
    { specId: "C-api", name: "API", type: "service" },
    { specId: "C-db", name: "Base", type: "store" },
    { specId: "C-sms", name: "SMS", type: "ext" },
    { specId: "C-file", name: "File", type: "queue" },
  ],
  relations: [
    { from: "C-web", to: "C-api", via: "HTTP" },
    { from: "C-api", to: "C-file", via: "planifie", async: true },
    { from: "C-api", to: "C-inconnu", via: "x" },
  ],
  actors: [{ id: "RL-client", name: "Client" }],
  outgoing: [{ zone: "Z-com", count: 2 }],
};
const ENTRIES: ArchZoneEntry[] = [
  {
    id: "Z-rdv",
    name: "Prise de rendez-vous",
    icon: "event",
    componentCount: 4,
    actorCount: 1,
    preview: [],
    links: [{ to: "Z-com", count: 2 }],
  },
  {
    id: "Z-com",
    name: "Communication",
    icon: "notifications",
    componentCount: 2,
    actorCount: 0,
    preview: [],
    links: [{ to: "Z-rdv", count: 2 }],
  },
];

describe("couches (B547)", () => {
  it("quatre couches : Utilisateurs, Applications, Services, Données et services externes", () => {
    expect(bandsOf().map((band) => band.label)).toEqual([
      "Utilisateurs",
      "Applications",
      "Services",
      "Données et services externes",
    ]);
  });

  it("y fixé par couche : acteur, application, service, puis stockage, file et externe sur la même couche", () => {
    const nodes = nodesOf([DETAIL]);
    const at = layerPositions(nodes);
    const bands = bandsOf();
    const lane = (id: string) =>
      bands.findIndex(
        (band) => at[id] && at[id].y >= band.top && at[id].y < band.top + band.height,
      );
    expect(lane("RL-client")).toBe(0);
    expect(lane("C-web")).toBe(1);
    expect(lane("C-api")).toBe(2);
    expect([lane("C-db"), lane("C-sms"), lane("C-file")]).toEqual([3, 3, 3]);
  });

  it("une carte d'une autre zone a sa propre rangée sous les couches (B648)", () => {
    const nodes = nodesOf([DETAIL], [{ id: "Z-com", name: "Communication" }]);
    const at = layerPositions(nodes);
    const lanesBottom = Math.max(...bandsOf().map((band) => band.top + band.height));
    expect(lanesBottom).toBe(790);
    expect(at["zone:Communication"]).toEqual({ x: 30, y: 850 });
    expect(at["zone:Communication"]?.y ?? 0).toBeGreaterThan(lanesBottom);
  });

  it("x par ordre des identifiants, espacé de la largeur du nœud + 24 px", () => {
    const at = layerPositions(nodesOf([DETAIL]));
    const data = ["C-db", "C-file", "C-sms"].map((id) => at[id]?.x ?? 0);
    expect(data).toEqual([30, 30 + 170 + 24, 30 + 2 * (170 + 24)]);
  });

  it("une position enregistrée passe par-dessus le placement, nœud par nœud ; jamais pour une zone voisine", () => {
    const nodes = nodesOf([DETAIL], [{ id: "Z-com", name: "Communication" }]);
    const placed = positionsOf(nodes, {
      "C-api": { x: 500, y: 400 },
      "zone:Communication": { x: 1, y: 1 },
    });
    expect(placed["C-api"]).toEqual({ x: 500, y: 400 });
    expect(placed["C-web"]).toEqual(layerPositions(nodes)["C-web"]);
    expect(placed["zone:Communication"]).toEqual(layerPositions(nodes)["zone:Communication"]);
  });
});

describe("nœuds, liens et zones voisines", () => {
  it("compose composants et acteurs ; un acteur partagé par deux zones n'est compté qu'une fois", () => {
    const nodes = nodesOf([DETAIL, { ...DETAIL, components: [] }]);
    expect(nodes.filter((node) => node.kind === "actor")).toHaveLength(1);
    expect(nodes.find((node) => node.id === "RL-client")).toMatchObject({ width: 160, height: 52 });
  });

  it("les zones voisines deviennent des nœuds estompés « Hors zone » qui nomment la zone à ouvrir", () => {
    const ghosts = ghostsOf(DETAIL, ENTRIES);
    expect(ghosts).toEqual([{ id: "Z-com", name: "Communication" }]);
    const node = nodesOf([DETAIL], ghosts).find((entry) => isGhostId(entry.id)) as ArchNode;
    expect(node).toMatchObject({
      id: "zone:Communication",
      subtitle: "Hors zone",
      ghostZone: "Communication",
    });
  });

  it("liens : moyen en étiquette, pointillés pour l'asynchrone, jamais vers un nœud absent", () => {
    const relations = relationsOf([DETAIL], nodesOf([DETAIL]));
    expect(relations).toHaveLength(2);
    expect(relations.find((link) => link.to === "C-file")).toMatchObject({
      label: "planifie",
      dashed: true,
    });
    expect(relations.find((link) => link.to === "C-api")).toMatchObject({
      label: "HTTP",
      dashed: false,
    });
  });
});

describe("liens inter-zones (TK-114c, B641)", () => {
  const OPEN: ArchZoneDetail = {
    ...DETAIL,
    crossRelations: [
      { from: "C-api", to: "C-mail", via: "contrat typé", zone: "Z-com" },
      { from: "C-api", to: "C-push", via: "file", async: true, zone: "Z-com" },
      { from: "C-sms", to: "C-push", via: "rappel", async: true, zone: "Z-com" },
      { from: "C-push", to: "C-db", via: "lecture", zone: "Z-com" },
      { from: "C-api", to: "C-x", via: "x", zone: "Z-sans-carte" },
    ],
  };
  const NAMES = new Map(ENTRIES.map((entry) => [entry.id, entry.name]));

  it("zone ouverte : trait composant → carte estompée, un par paire, premier moyen, sens gardé", () => {
    const nodes = nodesOf([OPEN], ghostsOf(OPEN, ENTRIES));
    const cross = relationsOf([OPEN], nodes, NAMES).filter(
      (link) => isGhostId(link.from) || isGhostId(link.to),
    );
    expect(cross.map((link) => link.id)).toEqual([
      "C-api>zone:Communication",
      "C-sms>zone:Communication",
      "zone:Communication>C-db",
    ]);
    expect(cross[0]).toMatchObject({ label: "contrat typé", dashed: false });
    expect(cross[1]).toMatchObject({ label: "rappel", dashed: true });
  });

  it("sans carte estompée ni nom de zone : aucun trait inter-zones", () => {
    const nodes = nodesOf([OPEN], ghostsOf(OPEN, ENTRIES));
    expect(relationsOf([OPEN], nodes).filter((link) => isGhostId(link.to))).toEqual([]);
    expect(relationsOf([OPEN], nodesOf([OPEN]), NAMES)).toHaveLength(2);
  });

  it("vue à plat : les deux composants présents, trait direct", () => {
    const other: ArchZoneDetail = {
      zone: { id: "Z-com", name: "Communication" },
      components: [
        { specId: "C-mail", name: "Mail", type: "ext" },
        { specId: "C-push", name: "Push", type: "service" },
      ],
      relations: [],
      actors: [],
      outgoing: [],
      crossRelations: [{ from: "C-push", to: "C-db", via: "lecture", zone: "Z-rdv" }],
    };
    const details = [OPEN, other];
    const ids = relationsOf(details, nodesOf(details), NAMES).map((link) => link.id);
    expect(ids).toEqual(
      expect.arrayContaining(["C-api>C-mail", "C-api>C-push", "C-sms>C-push", "C-push>C-db"]),
    );
    expect(ids.filter((id) => id === "C-push>C-db")).toHaveLength(1);
    expect(ids.some((id) => id.includes("zone:"))).toBe(false);
  });
});

describe("vue des zones (B546)", () => {
  it("TK-114c (B632) : dès 3 zones au-delà de 12 composants ; l'ancienne règle (25, 2 zones) reste", () => {
    expect([ZONE_VIEW_ABOVE, ZONE_VIEW_MIN_ZONES, ZONE_VIEW_LARGE_ABOVE]).toEqual([12, 3, 25]);
    expect(usesZoneView(13, 3)).toBe(true);
    expect(usesZoneView(12, 8)).toBe(false);
    expect(usesZoneView(23, 8)).toBe(true);
    expect(usesZoneView(13, 2)).toBe(false);
    expect(usesZoneView(26, 2)).toBe(true);
    expect(usesZoneView(25, 2)).toBe(false);
    expect(usesZoneView(34, 1)).toBe(false);
  });

  it("cartes triées par libellé, 300 x 180, grille à 2 colonnes (maquette 13 l.702)", () => {
    const nodes = zoneNodesOf(ENTRIES);
    expect(nodes.map((node) => node.name)).toEqual(["Communication", "Prise de rendez-vous"]);
    expect(nodes[0]).toMatchObject({ width: 300, height: 180 });
    expect(zoneGridPositions(nodes)).toEqual({
      "Z-com": { x: 40, y: 30 },
      "Z-rdv": { x: 440, y: 30 },
    });
  });

  it("un trait par paire de zones, étiqueté « 2 liens », d'autant plus épais qu'elle en compte", () => {
    const relations = zoneRelationsOf(ENTRIES);
    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({ label: "2 liens", from: "Z-com", to: "Z-rdv" });
    expect(relations[0]?.weight).toBeGreaterThan(1);
  });
});

describe("traits acteur → application (TK-114d, B654, B662)", () => {
  const TOTO: ArchZoneDetail = {
    zone: { id: "Z-courses", name: "Liste de courses" },
    components: [
      { specId: "C-ecran-liste", name: "Écran Liste de courses", type: "app" },
      { specId: "C-courses", name: "Service des courses", type: "service" },
    ],
    relations: [{ from: "C-ecran-liste", to: "C-courses", via: "appel" }],
    actors: [
      { id: "RL-colocataire", name: "Colocataire" },
      { id: "RL-invite", name: "Invité" },
    ],
    actorRelations: [
      { from: "RL-colocataire", to: "C-ecran-liste" },
      { from: "RL-invite", to: "C-ecran-liste" },
      { from: "RL-visiteur", to: "C-ecran-liste" },
    ],
    outgoing: [],
  };

  it("un trait plein sans étiquette par rôle relié à une application rendue", () => {
    const relations = relationsOf([TOTO], nodesOf([TOTO]));
    const actorLinks = relations.filter((link) => link.from.startsWith("RL-"));
    expect(actorLinks).toEqual([
      {
        id: "RL-colocataire>C-ecran-liste",
        from: "RL-colocataire",
        to: "C-ecran-liste",
        dashed: false,
      },
      { id: "RL-invite>C-ecran-liste", from: "RL-invite", to: "C-ecran-liste", dashed: false },
    ]);
    expect(relations).toHaveLength(3);
  });

  it("sans actorRelations (lecture d'avant 3.14.0) : aucun trait d'acteur", () => {
    const { actorRelations: _a, ...old } = TOTO;
    expect(relationsOf([old], nodesOf([old])).every((link) => !link.from.startsWith("RL-"))).toBe(
      true,
    );
  });
});
