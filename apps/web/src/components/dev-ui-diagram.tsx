"use client";

import { DiagramViewer, ErTableCard } from "@koklo/ui";
import { useState } from "react";
import {
  DEV_UI_RELATIONS,
  DEV_UI_RELATIONS_SAVED,
  DEV_UI_TABLES,
  DEV_UI_TABLES_SAVED,
  type DevUiTable,
} from "./dev-ui-diagram-data.ts";
import { DevUiFrame, DevUiNote, DevUiSection } from "./dev-ui-frame.tsx";

const renderTable = (
  node: DevUiTable,
  context: { selected: boolean; compact: boolean; onSelect: () => void },
) => (
  <ErTableCard id={node.id} name={node.name} fields={node.fields} state={node.state} {...context} />
);

/** Section « 21. Diagramme » : le lecteur (DESIGN.md §5.19), équipe avec déplacement, puis lecture seule à 50 %. */
export function DevUiDiagram() {
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
    </DevUiSection>
  );
}
