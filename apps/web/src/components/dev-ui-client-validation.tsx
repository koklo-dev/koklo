"use client";

import { InlineAlert, ReviewComment, ValidationBanner, ValidationPrompt } from "@koklo/ui";
import { DevUiFrame, DevUiSection } from "./dev-ui-frame.tsx";

const noop = () => undefined;

/** Section « 20. Vue client » de la galerie (TK-104, DESIGN.md §5.17) : bandeau, invite, confirmations, demande. */
export function DevUiClientValidation() {
  return (
    <DevUiSection id="dev-ui-client-validation" title="20. Vue client">
      <DevUiFrame title="ValidationBanner : attente et lecture seule" wide>
        <div className="flex flex-col gap-3">
          <ValidationBanner
            title="Votre validation est attendue."
            progress="Fonctionnalités 12/248 · parcours 3/18 · règles et rôles 1/2"
          >
            Relisez chaque onglet : les fonctionnalités et les parcours un par un, les règles et les
            rôles en bloc. Le cahier est validé quand tout l'est.
          </ValidationBanner>
          <ValidationBanner
            tone="neutral"
            title="Vous consultez le cahier."
            progress="Fonctionnalités 12/248"
          >
            La validation revient au client.
          </ValidationBanner>
        </div>
      </DevUiFrame>
      <DevUiFrame title="ValidationPrompt : barre de bloc">
        <ValidationPrompt
          variant="bar"
          question="Ces 24 règles décrivent-elles bien votre activité ?"
          validateLabel="Valider les règles"
          onValidate={noop}
          onRequestChange={noop}
        />
      </DevUiFrame>
      <DevUiFrame title="ValidationPrompt : sous une fiche">
        <ValidationPrompt
          variant="inline"
          validateLabel="Valider"
          placeholder="Décrivez ce qui ne correspond pas à votre besoin"
          note="Votre validation porte sur la version du 4 nov. · a1b2c3d. Si l'équipe modifie ensuite la fonctionnalité, elle vous sera re-présentée."
          onValidate={noop}
          onRequestChange={noop}
        />
      </DevUiFrame>
      <DevUiFrame title="InlineAlert : confirmations de décision">
        <div className="flex flex-col gap-3">
          <InlineAlert
            variant="success"
            icon="check_circle"
            action={{ label: "Annuler", onClick: noop }}
          >
            Parcours validé.
          </InlineAlert>
          <InlineAlert
            variant="revise"
            icon="edit_note"
            action={{ label: "Annuler", onClick: noop }}
          >
            Changement demandé à l'équipe pour ce parcours.
          </InlineAlert>
          <InlineAlert variant="warning" icon="schedule">
            3 éléments ont changé depuis votre validation.
          </InlineAlert>
        </div>
      </DevUiFrame>
      <DevUiFrame title="ReviewComment : demande du client">
        <ReviewComment name="Marie Lefèvre">
          On voudrait pouvoir déplacer jusqu'à 1 h avant, pas 2 h.
        </ReviewComment>
      </DevUiFrame>
    </DevUiSection>
  );
}
