"use client";

import { DiagramViewer, ErTableCard } from "@koklo/ui";
import { useMemo, useState } from "react";
import {
  type ZoneNode,
  zoneGridPositions,
  zoneNodesOf,
  zoneRelationsOf,
} from "../lib/data-diagram-zones.ts";
import { renderZone } from "./data-diagram-zones.tsx";
import {
  DEV_UI_RELATIONS,
  DEV_UI_RELATIONS_SAVED,
  DEV_UI_TABLES,
  DEV_UI_TABLES_SAVED,
  DEV_UI_ZONES,
  type DevUiTable,
} from "./dev-ui-diagram-data.ts";
import { DevUiFrame, DevUiNote, DevUiSection } from "./dev-ui-frame.tsx";

const renderTable = (
  node: DevUiTable,
  context: { selected: boolean; compact: boolean; onSelect: () => void },
) => (
  <ErTableCard id={node.id} name={node.name} fields={node.fields} state={node.state} {...context} />
);

/** Une tuile « à relire » sur la zone des rendez-vous : le détail de la carte la compte (maquette 11 l.575). */
const PENDING = [1, 2, 3, 4].map((n) => ({
  id: `T-nouvelle-${n}`,
  name: `Nouvelle ${n}`,
  fields: [],
  state: "review" as const,
  zone: "Prise de rendez-vous",
}));

/** Section « 21. Diagramme » : le lecteur (DESIGN.md §5.19), équipe avec déplacement, puis lecture seule à 50 %. */
export function DevUiDiagram() {
  const zones = useMemo(() => zoneNodesOf(DEV_UI_ZONES, PENDING), []);
  const links = useMemo(() => zoneRelationsOf(DEV_UI_ZONES), []);
  const [selected, setSelected] = useState<string | null>("T-reservation");
  const [moves, setMoves] = useState(0);
  return (
    <DevUiSection id="dev-ui-diagram" title="21. Diagramme">
      <DevUiFrame
        title="DiagramViewer : équipe (sélection, glisser, Alt + flèches), états à relire et rejetée"
        wide
      >
        <DevUiNote>
          Ctrl ou ⌘ + molette, ou Ctrl/⌘ + « + », « − », « 0 », zooment. Alt + flèches déplace la
          table focalisée de 20 px. Déplacements enregistrés dans cette démonstration : {moves}.
        </DevUiNote>
        <DiagramViewer<DevUiTable>
          label="Diagramme entité-relation, équipe"
          nodes={DEV_UI_TABLES}
          relations={DEV_UI_RELATIONS}
          renderNode={renderTable}
          selectedId={selected}
          onSelect={setSelected}
          onMove={() => setMoves((count) => count + 1)}
          className="h-[520px]"
        />
      </DevUiFrame>
      <DevUiFrame title="DiagramViewer : lecture seule (designer), zoom à 50 %, noms seuls" wide>
        <DevUiNote>
          Zoom sous 60 % : seuls les noms des tables s'affichent. Zoomez pour voir les champs.
        </DevUiNote>
        <DiagramViewer<DevUiTable>
          label="Diagramme entité-relation, lecture seule"
          nodes={DEV_UI_TABLES_SAVED}
          relations={DEV_UI_RELATIONS_SAVED}
          renderNode={renderTable}
          initialZoom={0.5}
          className="h-[320px]"
        />
      </DevUiFrame>
      <DevUiFrame
        title="DiagramViewer : vue des zones (65 tables en 6 zones, TK-110), icônes event et payments"
        wide
      >
        <DevUiNote>
          Une carte par zone : 7 noms puis « +N », « N à relire » en relecture. Un clic ouvre la
          zone.
        </DevUiNote>
        <DiagramViewer<ZoneNode>
          label="Diagramme par zones, démonstration"
          nodes={zones}
          positions={zoneGridPositions(zones)}
          relations={links}
          renderNode={(node, context) => renderZone(node, context, true)}
          onSelect={() => undefined}
          minimap
          className="h-[520px]"
        />
      </DevUiFrame>
    </DevUiSection>
  );
}
