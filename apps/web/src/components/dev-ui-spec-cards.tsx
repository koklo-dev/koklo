"use client";

import {
  FlowCard,
  type MatrixAction,
  PermissionMatrix,
  RoleCard,
  RuleCard,
  type RuleType,
  RuleTypeLegend,
} from "@koklo/ui";
import { useState } from "react";
import { DevUiFrame, DevUiSection } from "./dev-ui-frame.tsx";

const ROLES = [
  {
    id: "RL-client",
    name: "Client",
    description: "Réserve sans compte, identifié par son téléphone.",
  },
  { id: "RL-accueil", name: "Accueil", description: "Gère l'agenda du jour et les réservations." },
  { id: "RL-gerant", name: "Gérant", description: "Gère les services, les prix et le personnel." },
];

const access = (...levels: Array<"allowed" | "restricted" | "denied">) =>
  levels.map((level) => ({
    level,
    ...(level === "restricted" ? { restriction: "Les siennes" } : {}),
  }));

const ACTIONS: MatrixAction[] = [
  {
    id: "PM-reservation.creer",
    label: "Réserver un créneau",
    resource: "Réservation",
    access: access("allowed", "allowed", "allowed"),
  },
  {
    id: "PM-reservation.modifier",
    label: "Annuler ou déplacer",
    resource: "Réservation",
    access: access("restricted", "allowed", "allowed"),
  },
  {
    id: "PM-agenda.lire",
    label: "Voir l'agenda du jour",
    resource: "Agenda",
    access: access("denied", "allowed", "allowed"),
  },
  {
    id: "PM-service.gerer",
    label: "Gérer les services et les prix",
    resource: "Catalogue",
    access: access("denied", "denied", "allowed"),
  },
];

const RULES: Array<{
  id: string;
  title: string;
  type: RuleType;
  statement: string;
  example: string;
  states?: string[];
}> = [
  {
    id: "R-002",
    title: "Délai d'annulation",
    type: "contrainte",
    statement: "Une réservation ne peut être annulée ou déplacée qu'à plus de 2 h du rendez-vous.",
    example: "Rendez-vous à 14 h : annulation possible jusqu'à 12 h.",
  },
  {
    id: "R-003",
    title: "Acompte des longues prestations",
    type: "calcul",
    statement: "Une prestation de plus de 2 h demande un acompte de 20 % du prix.",
    example: "Couleur + soin à 145 € : acompte de 29 €.",
  },
  {
    id: "R-004",
    title: "Cycle d'une réservation",
    type: "workflow",
    statement: "Une réservation est confirmée, puis honorée, annulée ou marquée absente.",
    example: "Le client ne vient pas : l'accueil la marque « absente ».",
    states: ["Confirmée", "Honorée", "Annulée", "Absente"],
  },
];

const STEPS = [
  { label: "Accueil du portail", screen: "S-accueil" },
  { label: "Choisir un service", screen: "S-services" },
  { label: "Choisir un créneau", screen: "S-creneaux" },
  { label: "Saisir ses coordonnées", screen: "S-reservation" },
  { label: "Confirmation", screen: "S-confirmation" },
];

function Matrix() {
  const [filter, setFilter] = useState("");
  const shown = ACTIONS.filter(
    (action) =>
      !filter || `${action.label} ${action.id}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <PermissionMatrix
      roles={ROLES}
      actions={shown}
      total={shown.length}
      filter={filter}
      onFilterChange={setFilter}
    />
  );
}

function Legend() {
  const [type, setType] = useState<RuleType | undefined>(undefined);
  return (
    <div className="flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
      <span>
        Une règle métier est une vérité du domaine que le produit doit toujours respecter.
      </span>
      <span className="flex-1" />
      <RuleTypeLegend value={type} onChange={setType} />
    </div>
  );
}

/** Section « 19. Règles, rôles et parcours » de la galerie (TK-103, DESIGN.md §5.16). */
export function DevUiSpecCards() {
  return (
    <DevUiSection id="dev-ui-spec-cards" title="19. Règles, rôles et parcours">
      <DevUiFrame title="RuleCard et WorkflowStates : contrainte, calcul, workflow" wide>
        <div className="flex flex-col gap-3">
          <Legend />
          <div className="grid gap-3 lg:grid-cols-[repeat(auto-fill,minmax(420px,1fr))]">
            {RULES.map((rule, index) => (
              <RuleCard
                key={rule.id}
                {...rule}
                features={["F-001", "F-002"]}
                selected={index === 0}
                onEdit={() => undefined}
              />
            ))}
          </div>
        </div>
      </DevUiFrame>
      <DevUiFrame title="RoleCard : trois teintes cycliques" wide>
        <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {ROLES.map((role, index) => (
            <RoleCard key={role.id} {...role} index={index} onEdit={() => undefined} />
          ))}
        </div>
      </DevUiFrame>
      <DevUiFrame title="PermissionMatrix : « Qui peut faire quoi »" wide>
        <Matrix />
      </DevUiFrame>
      <DevUiFrame title="FlowCard, FlowSteps et FlowError" wide>
        <FlowCard
          id="P-reserver"
          title="Réserver un rendez-vous"
          actor="Client"
          steps={STEPS}
          features={["F-001", "F-004"]}
          errors={[
            {
              step: 4,
              text: "créneau pris entre-temps → retour à l'étape 3 (F-001 · AC-2, R-001).",
            },
            { step: 4, text: "téléphone invalide → message sous le champ, rien n'est perdu." },
          ]}
          onEdit={() => undefined}
        />
      </DevUiFrame>
    </DevUiSection>
  );
}
