import { getSession, ORG_ID, organization, procedures, sessionWith } from "./web-mocks.ts";

/** Données de l'écran Membres (contrat 2.2.0) : propriétaire (soi), développeur, client lié à un projet. */
export const SELF_ID = "01900000-0000-7000-8000-0000000000c1";
export const P1 = { id: "01900000-0000-7000-8000-0000000000e1", name: "Portail de réservation" };
export const P2 = { id: "01900000-0000-7000-8000-0000000000e2", name: "Site vitrine" };

export const ROWS = [
  {
    id: "01900000-0000-7000-8000-0000000000b1",
    userId: SELF_ID,
    name: "Awa Koné",
    email: "awa@example.com",
    role: "owner",
    projects: [],
    lastActiveAt: "2026-11-07T08:00:00.000Z",
  },
  {
    id: "01900000-0000-7000-8000-0000000000b2",
    userId: "01900000-0000-7000-8000-0000000000c2",
    name: "Moussa Diallo",
    email: "moussa@example.com",
    role: "dev",
    projects: [],
    lastActiveAt: null,
  },
  {
    id: "01900000-0000-7000-8000-0000000000b3",
    userId: "01900000-0000-7000-8000-0000000000c3",
    name: "Nadia Client",
    email: "nadia@example.com",
    role: "client",
    projects: [P1],
    lastActiveAt: "2026-11-04T10:00:00.000Z",
  },
];
export const PAGE = { items: ROWS, total: 3, totalIsEstimate: false };

export const PENDING = [
  {
    id: "01900000-0000-7000-8000-0000000000d1",
    email: "nina@example.com",
    role: "designer",
    status: "pending",
    expiresAt: "2026-11-11T10:00:00.000Z",
    invitedBy: "Awa Koné",
    projects: [],
  },
  {
    id: "01900000-0000-7000-8000-0000000000d2",
    email: "karim@example.com",
    role: "client",
    status: "pending",
    expiresAt: "2026-11-12T10:00:00.000Z",
    invitedBy: "Moussa Diallo",
    projects: [P1],
  },
];

/** Connecte la session avec ce rôle dans l'organisation active. */
export function asRole(role: string): void {
  getSession.mockResolvedValue(sessionWith(ORG_ID));
  procedures.organizationList.mockResolvedValue([organization({ role })]);
}

/** Valeurs par défaut de l'écran : trois membres, deux invitations, deux projets. */
export function seedMembers(): void {
  procedures.memberPage.mockResolvedValue(PAGE);
  procedures.invitationList.mockResolvedValue(PENDING);
  procedures.projectList.mockResolvedValue([P1, P2]);
  asRole("owner");
}
