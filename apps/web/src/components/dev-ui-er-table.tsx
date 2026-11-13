import { ErTableCard, type ErTableField, ListFooter } from "@koklo/ui";
import { DevUiFrame, DevUiSection } from "./dev-ui-frame.tsx";

const RESERVATION: readonly ErTableField[] = [
  { name: "id", type: "uuid", kind: "primary" },
  { name: "client_id", type: "ref(T-client)", kind: "reference" },
  { name: "creneau_id", type: "ref(T-creneau)", kind: "reference" },
  { name: "statut", type: "enum" },
  { name: "jeton_lien", type: "texte(64)" },
];
const CLIENT: readonly ErTableField[] = [
  { name: "id", type: "uuid", kind: "primary" },
  { name: "nom", type: "texte(80)" },
  { name: "telephone", type: "texte(20)", kind: "personal" },
];

/** Section « 20. Modèle de données » : la carte de table dans ses états (DESIGN.md §5.18, maquette 11 l.404-412). */
export function DevUiErTable() {
  return (
    <DevUiSection id="dev-ui-er-table" title="20. Modèle de données">
      <DevUiFrame title="ErTableCard : enregistrée, à relire, rejetée" wide>
        <ul aria-label="Cartes de table" className="m-0 flex list-none flex-wrap gap-4 p-0">
          <ErTableCard id="T-reservation" name="Réservation" fields={RESERVATION} />
          <ErTableCard id="T-client" name="Client" fields={CLIENT} state="review" />
          <ErTableCard id="T-avis" name="Avis" fields={CLIENT} state="rejected" />
        </ul>
      </DevUiFrame>
      <DevUiFrame title="ListFooter attached : pied dans le cadre du tableau">
        <div className="rounded-t-xl border border-border border-b-0 bg-surface p-3 text-meta">
          Tableau
        </div>
        <ListFooter attached state="end" total={6} noun={{ one: "table", other: "tables" }} />
      </DevUiFrame>
    </DevUiSection>
  );
}
