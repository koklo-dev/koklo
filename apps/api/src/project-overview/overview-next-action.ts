import type { OverviewNextAction } from "@koklo/contract";
import type { ProjectPhase } from "../project/project-shell.ts";
import { AI_SETTINGS_PATH, ideaLink, specLink, ticketsLink } from "./overview-links.ts";
import { plural } from "./overview-texts.ts";

/** Une fonctionnalité sans verdict sur la version courante depuis ce délai appelle une relance (B276). */
export const FEATURE_REMINDER_HOURS = 48;

/** Ce que le Fonctionnel, seul livrable validable avant TK-100, dit de son état de validation. */
export interface FunctionalFacts {
  /** Fonctionnalités sans verdict valable sur la version courante. */
  pending: number;
  /** Date de l'instantané de la version courante ; `null` sans version. */
  pendingSince: Date | null;
  /** Fonctionnalités dont le dernier verdict est « changements demandés ». */
  revise: number;
  /** Vrai si le livrable n'est pas validé et qu'aucun client ne le valide : l'équipe s'en charge. */
  teamPending: boolean;
}

/** Faits purs de la prochaine étape : aucune lecture, aucune horloge (`now` est injecté). */
export interface NextActionFacts {
  projectId: string;
  audience: "team" | "client";
  /** Owner ou admin : seuls à configurer l'IA et à diagnostiquer la spec. */
  manager: boolean;
  /** Rôle autorisé à décider des propositions de l'agent (`IDEA_WRITE_ROLES`). */
  canDecideIdea: boolean;
  /** Rôle autorisé à valider des fonctionnalités (`REVIEW_SUBMIT_ROLES`). */
  canValidate: boolean;
  phase: ProjectPhase;
  now: Date;
  aiConfigured: boolean;
  specFailed: boolean;
  /** Toutes les pages du dossier d'idée sont vides. */
  fresh: boolean;
  proposals: { count: number; authorName: string | null };
  missingRequired: { count: number; firstTitle: string | null };
  clientName: string | null;
  functional: FunctionalFacts;
  /** Livrable suivant à proposer ; sans source avant son écran (B276), donc `null` en production. */
  proposeNext: { label: string; href: string } | null;
  inReviewTickets: number;
  /** Demande de changement en attente du client (lot 12) ; `null` en production. */
  changeRequest: { key: string; href: string } | null;
}

type Rule = (facts: NextActionFacts) => OverviewNextAction | null;

const warning = (
  rule: string,
  title: string,
  body: string,
  action?: { label: string; href: string; kind?: "link" | "copy_link" },
): OverviewNextAction => ({
  rule,
  tone: "warning",
  title,
  body,
  ...(action ? { action: { kind: "link", ...action } } : {}),
});

const firstName = (name: string): string => name.split(/\s+/)[0] ?? name;

const aiNotConfigured: Rule = (f) =>
  f.audience === "team" && f.manager && !f.aiConfigured
    ? warning(
        "ai_not_configured",
        "L'IA n'est pas configurée pour l'organisation",
        "Sans fournisseur d'IA, l'agent de l'espace Idée ne peut pas répondre.",
        { label: "Configurer l'IA", href: AI_SETTINGS_PATH },
      )
    : null;

const specFailed: Rule = (f) =>
  f.audience === "team" && f.manager && f.specFailed
    ? warning(
        "spec_failed",
        "La préparation de la spec a échoué",
        "Le dépôt de spec n'a pas pu être lu. Le détail indique comment la relancer.",
        { label: "Voir le détail", href: specLink(f.projectId) },
      )
    : null;

const proposalsPending: Rule = ({ projectId, phase, audience, canDecideIdea, proposals: p }) => {
  if (phase !== "idea" || p.count === 0) return null;
  const href = ideaLink(projectId);
  if (audience === "client") {
    if (!canDecideIdea) return null;
    const title = `${p.count} ${plural(p.count, "proposition de l'agent attend", "propositions de l'agent attendent")} votre avis`;
    return warning("proposals_pending", title, "Acceptez ou refusez-les dans l'espace Idée.", {
      label: "Relire",
      href,
    });
  }
  const lead = p.authorName ? `${p.authorName} a répondu à l'agent : ` : "";
  const noun = plural(p.count, "proposition", "propositions");
  const title = p.authorName
    ? `${lead}${p.count} ${noun} à relire`
    : `${p.count} ${noun} de l'agent à relire`;
  return warning("proposals_pending", title, "Relisez-les dans l'espace Idée avant de continuer.", {
    label: "Relire",
    href,
  });
};

const newProject: Rule = (f) =>
  f.audience === "team" && f.phase === "idea" && f.fresh
    ? warning(
        "new_project",
        "Commencez le dossier d'idée",
        "Les pages du dossier sont vides : l'agent vous pose des questions pour les remplir.",
        { label: "Ouvrir l'espace Idée", href: ideaLink(f.projectId) },
      )
    : null;

const requiredPages: Rule = ({ projectId, audience, phase, missingRequired: m }) => {
  if (audience !== "team" || phase !== "idea" || m.count === 0) return null;
  const noun = plural(m.count, "page requise", "pages requises");
  return warning(
    "required_pages",
    `Il reste ${m.count} ${noun} à stabiliser`,
    "Le cadrage se débloque quand les pages requises sont stables.",
    {
      label: m.firstTitle ? `Ouvrir ${m.firstTitle}` : "Ouvrir le dossier",
      href: ideaLink(projectId),
    },
  );
};

const overdue = ({ pendingSince, pending }: FunctionalFacts, now: Date): boolean =>
  pending > 0 &&
  pendingSince !== null &&
  now.getTime() - pendingSince.getTime() >= FEATURE_REMINDER_HOURS * 3_600_000;

const validationOverdue: Rule = (f) => {
  if (f.phase !== "framing") return null;
  const href = specLink(f.projectId);
  const count = f.functional.pending;
  const features = plural(count, "fonctionnalité", "fonctionnalités");
  if (f.audience === "client") {
    return f.canValidate && count > 0
      ? warning(
          "validation_overdue",
          `Vous avez ${count} ${features} à valider`,
          "Ouvrez le cahier fonctionnel pour les relire.",
        )
      : null;
  }
  if (!f.clientName || !overdue(f.functional, f.now)) return null;
  return warning(
    "validation_overdue",
    `Le cahier fonctionnel attend la validation de ${f.clientName}`,
    `${count} ${features} en attente depuis plus de ${FEATURE_REMINDER_HOURS} h.`,
    { label: `Relancer ${firstName(f.clientName)}`, href, kind: "copy_link" },
  );
};

const changesRequested: Rule = (f) => {
  if (f.audience !== "team" || f.phase !== "framing" || f.functional.revise === 0) return null;
  const features = plural(f.functional.revise, "fonctionnalité", "fonctionnalités");
  return warning(
    "changes_requested",
    `${f.clientName ?? "Le client"} demande des changements sur le cahier fonctionnel`,
    `${f.functional.revise} ${features} à revoir.`,
    { label: "Voir les remarques", href: specLink(f.projectId) },
  );
};

const proposeNext: Rule = (f) =>
  f.audience === "team" && f.phase === "framing" && f.proposeNext
    ? warning(
        "propose_next",
        `Proposer ${f.proposeNext.label}`,
        "Le livrable précédent est validé : la suite du cadrage peut être proposée.",
        { label: "Proposer", href: f.proposeNext.href },
      )
    : null;

const teamValidation: Rule = (f) =>
  f.audience === "team" && f.phase === "framing" && f.functional.teamPending
    ? warning(
        "team_validation",
        "Le cahier fonctionnel reste à valider par l'équipe",
        "Aucun client n'est lié au projet : la validation revient à l'équipe.",
        { label: "Ouvrir", href: specLink(f.projectId) },
      )
    : null;

const ticketsInReview: Rule = (f) => {
  if (f.audience !== "team" || f.phase !== "iterations" || f.inReviewTickets === 0) return null;
  const verb = plural(f.inReviewTickets, "ticket attend", "tickets attendent");
  return warning(
    "tickets_in_review",
    `${f.inReviewTickets} ${verb} une revue de code`,
    "Relisez les demandes de fusion avant la fin du sprint.",
    { label: "Voir les PR", href: ticketsLink(f.projectId) },
  );
};

const changeRequest: Rule = (f) =>
  f.audience === "team" && f.phase === "iterations" && f.changeRequest
    ? warning(
        "change_request",
        `${f.changeRequest.key} attend la décision de ${f.clientName ?? "le client"}`,
        "La demande de changement est en attente de réponse.",
        { label: "Ouvrir", href: f.changeRequest.href },
      )
    : null;

/** De la plus prioritaire à la moins prioritaire : la première qui s'applique gagne (03 §5, B276). */
const RULES: readonly Rule[] = [
  aiNotConfigured,
  specFailed,
  proposalsPending,
  newProject,
  requiredPages,
  validationOverdue,
  changesRequested,
  proposeNext,
  teamValidation,
  ticketsInReview,
  changeRequest,
];

const WORKING_ON: Record<ProjectPhase, string> = {
  idea: "le dossier d'idée",
  framing: "le cahier fonctionnel",
  iterations: "le sprint en cours",
};

function nothingToDo({ audience, phase }: NextActionFacts): OverviewNextAction {
  return audience === "client"
    ? {
        rule: "none",
        tone: "neutral",
        title: "Rien n'attend votre action.",
        body: `L'équipe travaille sur ${WORKING_ON[phase]}.`,
      }
    : { rule: "none", tone: "neutral", title: "Rien n'attend d'action.", body: "" };
}

/** Prochaine étape d'un projet : fonction pure des faits, la vue client n'en reçoit que les règles qui la concernent. */
export function nextActionOf(facts: NextActionFacts): OverviewNextAction {
  for (const rule of RULES) {
    const next = rule(facts);
    if (next) return next;
  }
  return nothingToDo(facts);
}
