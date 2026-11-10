import type { ticketStatusSchema } from "@koklo/contract";
import type { z } from "zod";
import { initialsOf, plural } from "./overview-texts.ts";

type IdeaPageStatus = "empty" | "draft" | "review" | "stable";
type TicketStatus = z.infer<typeof ticketStatusSchema>;

/** Taille des aperçus du bloc principal, des personnes et de l'activité. */
export const OVERVIEW_LIST_MAX = 5;

export interface IdeaPageFact {
  position: number;
  title: string;
  status: IdeaPageStatus;
  required: boolean;
  pendingProposals: number;
  updatedAt: Date;
}

const rankOf = (page: IdeaPageFact): number => {
  if (page.pendingProposals > 0) return 0;
  return page.required && page.status !== "stable" ? 1 : 2;
};

function noteOf(page: IdeaPageFact): string {
  if (page.pendingProposals > 0) {
    return `${page.pendingProposals} ${plural(page.pendingProposals, "proposition", "propositions")} de l'agent`;
  }
  if (page.status === "stable") return "Stable";
  if (page.required) {
    return page.status === "empty" ? "Page requise, encore vide" : "Page requise, à stabiliser";
  }
  return { empty: "Page vide", draft: "Brouillon en cours", review: "À relire" }[page.status];
}

/** Cinq pages : propositions en attente, puis requises non stables, puis les plus récemment modifiées. */
export function ideaPagesOf(pages: readonly IdeaPageFact[]) {
  return [...pages]
    .sort(
      (a, b) =>
        rankOf(a) - rankOf(b) ||
        b.updatedAt.getTime() - a.updatedAt.getTime() ||
        a.position - b.position,
    )
    .slice(0, OVERVIEW_LIST_MAX)
    .map((page) => ({
      position: page.position,
      title: page.title,
      note: noteOf(page),
      status: page.status,
    }));
}

export interface TicketFact {
  key: string;
  title: string;
  status: TicketStatus;
  updatedAt: Date;
}

const TICKET_RANK: Partial<Record<TicketStatus, number>> = {
  in_review: 0,
  in_progress: 1,
  done: 2,
};
const TICKET_NOTE: Record<TicketStatus, string> = {
  in_review: "En revue de code",
  in_progress: "En cours",
  done: "Terminé",
  blocked: "Bloqué",
  todo: "Non commencé",
  backlog: "Non commencé",
  cancelled: "Annulé",
};

/** Cinq tickets du sprint : en revue, en cours, puis terminés récemment, puis le reste. */
export function sprintTicketsOf(tickets: readonly TicketFact[]) {
  const rank = (ticket: TicketFact) => TICKET_RANK[ticket.status] ?? 3;
  return [...tickets]
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, OVERVIEW_LIST_MAX)
    .map(({ key, title, status }) => ({ key, title, note: TICKET_NOTE[status], status }));
}

export interface MemberFact {
  name: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  client: "Client · valide le cadrage",
  business: "Métier · lit et commente",
  owner: "Propriétaire",
  admin: "Administrateur",
  dev: "Développeur",
  designer: "Designer",
};
const TEAM_ORDER = ["owner", "admin", "dev", "designer"];

/** L'équipe par rôle (owner, admin, dev, designer) puis par nom. */
export const teamInOrder = (staff: readonly MemberFact[]): MemberFact[] =>
  [...staff].sort(
    (a, b) =>
      TEAM_ORDER.indexOf(a.role) - TEAM_ORDER.indexOf(b.role) || a.name.localeCompare(b.name, "fr"),
  );

/** Personnes du projet : le ou les clients d'abord, puis l'équipe par rôle ; cinq au plus, le reste compté. */
export function peopleOf(clients: readonly MemberFact[], staff: readonly MemberFact[]) {
  const everyone = [
    ...clients.map((member) => ({ member, kind: "client" as const })),
    ...teamInOrder(staff).map((member) => ({ member, kind: "team" as const })),
  ];
  return {
    items: everyone.slice(0, OVERVIEW_LIST_MAX).map(({ member, kind }) => ({
      name: member.name,
      initials: initialsOf(member.name),
      role: ROLE_LABEL[member.role] ?? member.role,
      kind,
    })),
    others: Math.max(0, everyone.length - OVERVIEW_LIST_MAX),
  };
}
