/**
 * Charges de webhook GitHub réalistes et anonymisées (formes réelles, valeurs inventées), avec les
 * champs personnels (auteurs, e-mails, expéditeur) que la normalisation doit écarter.
 */
export const PERSONAL = {
  authorEmail: "alice.durand.sentinel@example.invalid",
  authorName: "Alice Durand SENTINEL",
  committerEmail: "committer.sentinel@example.invalid",
  pusherEmail: "pusher.sentinel@example.invalid",
  senderLogin: "sender-sentinel-login",
  message: "commit message SENTINEL",
  avatar: "https://avatars.example.invalid/u/424242?v=4",
} as const;

export const DELIVERY_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
export const SHA_BEFORE = "1".repeat(40);
export const SHA_AFTER = "2".repeat(40);

const commit = (n: number) => ({
  id: n.toString(16).padStart(40, "0"),
  tree_id: "3".repeat(40),
  distinct: true,
  message: `${PERSONAL.message} ${n}`,
  timestamp: "2026-10-30T10:00:00+01:00",
  url: `https://github.example.invalid/acme/specs/commit/${n}`,
  author: { name: PERSONAL.authorName, email: PERSONAL.authorEmail, username: "alice" },
  committer: { name: PERSONAL.authorName, email: PERSONAL.committerEmail, username: "alice" },
  added: ["features/F-001.md"],
  removed: [],
  modified: [],
});

const repository = {
  id: 9001,
  node_id: "R_kgDOxxxxxx",
  name: "specs",
  full_name: "acme/specs",
  private: true,
  owner: { login: "acme", id: 77, type: "Organization", email: PERSONAL.pusherEmail },
  html_url: "https://github.example.invalid/acme/specs",
  default_branch: "main",
};

export function pushPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ref: "refs/heads/cadrage",
    before: SHA_BEFORE,
    after: SHA_AFTER,
    created: false,
    deleted: false,
    forced: false,
    base_ref: null,
    compare: "https://github.example.invalid/acme/specs/compare/111...222",
    commits: [commit(1), commit(2)],
    head_commit: commit(2),
    repository,
    pusher: { name: "alice", email: PERSONAL.pusherEmail },
    sender: { login: PERSONAL.senderLogin, id: 424242, avatar_url: PERSONAL.avatar, type: "User" },
    installation: { id: 4242, node_id: "MDIzOkluc3RhbGxhdGlvbjQyNDI=" },
    ...overrides,
  };
}

export function installationPayload(
  action: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    action,
    installation: {
      id: 4242,
      client_id: "Iv1.fixture",
      account: {
        login: "acme",
        id: 77,
        type: "Organization",
        email: PERSONAL.pusherEmail,
        avatar_url: PERSONAL.avatar,
      },
      repository_selection: "selected",
      app_id: 123456,
      permissions: { contents: "write", metadata: "read" },
      events: ["push"],
      suspended_by: action === "suspend" ? { login: PERSONAL.senderLogin, id: 424242 } : null,
    },
    repositories: [{ id: 9001, name: "specs", full_name: "acme/specs", private: true }],
    sender: { login: PERSONAL.senderLogin, id: 424242, avatar_url: PERSONAL.avatar, type: "User" },
    ...overrides,
  };
}

export function otherPayload(action: string | null = "opened"): Record<string, unknown> {
  return {
    ...(action === null ? {} : { action }),
    number: 12,
    pull_request: {
      id: 1,
      title: "PR title SENTINEL",
      body: "PR body SENTINEL",
      user: { login: PERSONAL.senderLogin, email: PERSONAL.authorEmail },
      head: { sha: SHA_AFTER, ref: "feat/x" },
    },
    repository,
    sender: { login: PERSONAL.senderLogin, id: 424242 },
    installation: { id: 4242 },
  };
}
