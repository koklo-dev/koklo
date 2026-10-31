import { getSession, ORG_ID, organization, procedures, sessionWith } from "./web-mocks.ts";

export const INSTALL_ID_1 = "01900000-0000-7000-8000-0000000000e1";
export const INSTALL_ID_2 = "01900000-0000-7000-8000-0000000000e2";
export const INSTALL_ID_3 = "01900000-0000-7000-8000-0000000000e3";
export const INSTALL_ID_4 = "01900000-0000-7000-8000-0000000000e4";

export const installation = (over: Record<string, unknown> = {}) => ({
  id: INSTALL_ID_1,
  provider: "github",
  ownerKind: "organization",
  ownerLogin: "acme-corp",
  status: "active",
  userAuthorization: "active",
  createdAt: "2026-10-20T10:00:00.000Z",
  ...over,
});

export const GITHUB_URL = "https://github.com/apps/koklo/installations/new?state=abc.def";
export const START_REPLY = { url: GITHUB_URL, expiresAt: "2026-10-31T12:10:00.000Z" };

export const INSTALL_BUTTON = "Installer l'application GitHub";

/** Rôle courant de la personne dans l'organisation active (organization.list + session). */
export function asRole(role: string): void {
  getSession.mockResolvedValue(sessionWith(ORG_ID));
  procedures.organizationList.mockResolvedValue([organization({ role })]);
}
