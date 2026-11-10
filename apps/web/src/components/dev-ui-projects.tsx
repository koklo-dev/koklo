"use client";

import {
  Button,
  PhasePill,
  ProgressChecklist,
  type ProgressStep,
  ProjectCard,
  ProjectCardCreating,
  type ProjectCardProps,
  ProjectTile,
} from "@koklo/ui";
import { DevUiFrame, DevUiRow, DevUiSection } from "./dev-ui-frame.tsx";

const HUES = [1, 2, 3, 4, 5] as const;
const INITIALS = ["PR", "PF", "PP", "AC", "SV"] as const;

const PEOPLE = [
  { initials: "ML", name: "Marie Lefèvre (client)", isClient: true },
  { initials: "AK", name: "Awa Koné" },
  { initials: "MD", name: "Moussa Diallo" },
];

const BASE: ProjectCardProps = {
  href: "/dev/ui#dev-ui-projects",
  name: "Portail de réservation",
  initials: "PR",
  colorKey: 1,
  client: "Marie Lefèvre · Salon Lumière",
  phase: "framing",
  progress: { label: "Livrables validés", valueLabel: "2 sur 7", done: 2, total: 7 },
  next: { title: "Le cahier fonctionnel attend la validation de Marie", attention: true },
  people: PEOPLE,
  activity: "Marie, il y a 2 h",
};

const CARDS: ProjectCardProps[] = [
  BASE,
  {
    ...BASE,
    name: "Portail partenaires",
    initials: "PP",
    colorKey: 3,
    client: "Groupe Hexa",
    phase: "iterations",
    progress: { label: "Sprint SP-7", valueLabel: "5 tickets sur 8", done: 5, total: 8 },
    next: { title: "2 tickets attendent une revue de code", attention: false },
    people: PEOPLE.slice(1),
    activity: "Moussa, hier",
  },
  {
    ...BASE,
    name: "Application caisse",
    initials: "AC",
    colorKey: 4,
    client: "Aucun client invité",
    phase: "idea",
    progress: { label: "Dossier d'idée", valueLabel: "1 page stable sur 10", done: 1, total: 10 },
    next: null,
    people: PEOPLE.slice(1, 2),
    activity: "Awa, il y a 3 j",
  },
  {
    ...BASE,
    name: "Site vitrine Hexa",
    initials: "SV",
    colorKey: 5,
    client: null,
    progress: { label: "Livrables validés", valueLabel: "5 sur 7", done: 5, total: 7 },
    next: { title: "Le design attend votre validation", attention: true },
  },
];

const RUNNING: ProgressStep[] = [
  { key: "project", label: "Projet créé", status: "done" },
  { key: "idea", label: "Dossier d'idée prêt (10 pages)", status: "done" },
  { key: "repo", label: "Création du dépôt de spec sur GitHub…", status: "running" },
];

const FAILED: ProgressStep[] = [
  { key: "project", label: "Projet créé", status: "done" },
  { key: "idea", label: "Dossier d'idée prêt (10 pages)", status: "done" },
  {
    key: "repo",
    label: "Dépôt de spec non créé",
    status: "error",
    detail: "Ce nom est déjà pris sur ce compte. Choisissez un autre nom.",
  },
];

function Tiles() {
  return (
    <DevUiFrame title="ProjectTile : 22, 36 et 40, cinq teintes" wide>
      <div className="flex flex-col gap-3">
        {([22, 36, 40] as const).map((size) => (
          <DevUiRow key={size}>
            <span className="w-10 text-meta text-muted-foreground">{size}</span>
            {HUES.map((hue, index) => (
              <ProjectTile
                key={hue}
                initials={INITIALS[index] ?? "PR"}
                colorKey={hue}
                size={size}
              />
            ))}
          </DevUiRow>
        ))}
      </div>
    </DevUiFrame>
  );
}

function Pills() {
  return (
    <DevUiFrame title="PhasePill : Idée, Cadrage, Itérations">
      <DevUiRow>
        <PhasePill phase="idea" />
        <PhasePill phase="framing" />
        <PhasePill phase="iterations" />
      </DevUiRow>
    </DevUiFrame>
  );
}

function Checklists() {
  return (
    <DevUiFrame title="ProgressChecklist : en cours, échec">
      <div className="flex flex-col gap-4">
        <ProgressChecklist items={RUNNING} announce={false} />
        <ProgressChecklist items={FAILED} announce={false} />
      </div>
    </DevUiFrame>
  );
}

function Cards() {
  return (
    <DevUiFrame title="ProjectCard : attention, neutre, sans client invité, vue client" wide>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4 p-0">
        {CARDS.map((card) => (
          <li key={card.name} className="flex">
            <ProjectCard {...card} className="w-full" />
          </li>
        ))}
      </ul>
    </DevUiFrame>
  );
}

function Creating() {
  return (
    <DevUiFrame title="ProjectCard creating : en cours, échec" wide>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
        <ProjectCardCreating
          href="/dev/ui#dev-ui-projects"
          name="Atelier neuf"
          initials="AN"
          colorKey={2}
          steps={RUNNING}
          note="Vous pouvez déjà ouvrir le projet et écrire l'idée."
        />
        <ProjectCardCreating
          href="/dev/ui#dev-ui-projects"
          name="Atelier neuf"
          initials="AN"
          colorKey={2}
          steps={FAILED}
          note="Vous pouvez déjà ouvrir le projet et écrire l'idée."
          actions={
            <Button variant="outline" size="sm" className="self-start">
              Choisir un autre nom
            </Button>
          }
        />
      </div>
    </DevUiFrame>
  );
}

/** Section « Projets » de la galerie (TK-93, DESIGN.md §5.12) : tuiles, pastilles de phase, liste d'avancement, cartes. */
export function DevUiProjects() {
  return (
    <DevUiSection id="dev-ui-projects" title="15. Projets">
      <Tiles />
      <Pills />
      <Checklists />
      <Cards />
      <Creating />
    </DevUiSection>
  );
}
