import { createHash } from "node:crypto";
import { createMockGitHub, type MockGitHub, type RecordedRequest } from "./mock-github.ts";

/**
 * Serveur Git simulé, à état, derrière le transport `fetch` de l'adaptateur (TK-44a). Il parle
 * le sous-ensemble de l'API REST GitHub nécessaire à l'écriture de spec par lots :
 *
 *   POST  /orgs/{o}/repos                          crée un dépôt (commit initial, branche main)
 *   GET   /repos/{o}/{r}                           lit le dépôt
 *   GET   /repos/{o}/{r}/commits/{ref}             un commit (branche, tag ou SHA)
 *   GET   /repos/{o}/{r}/commits?sha=&per_page=    liste (plus récent d'abord, Link rel=next)
 *   GET   /repos/{o}/{r}/git/ref/heads/{branche}   tête d'une branche
 *   POST  /repos/{o}/{r}/git/refs                  crée une branche
 *   PATCH /repos/{o}/{r}/git/refs/heads/{branche}  avance une branche (422 si pas fast-forward)
 *   GET   /repos/{o}/{r}/git/commits/{sha}         un commit Git (arbre, parents)
 *   POST  /repos/{o}/{r}/git/commits               crée un commit
 *   POST  /repos/{o}/{r}/git/trees                 crée un arbre (base_tree, content, sha: null = suppression)
 *   GET   /repos/{o}/{r}/git/trees/{sha|branche}   lit un arbre (`recursive` pour tout l'arbre)
 *   GET   /repos/{o}/{r}/contents/{chemin}?ref=    lit un fichier (base64)
 *
 * Toute autre route répond 404 et est listée dans `unmatched` : un adaptateur qui sortirait de
 * ce sous-ensemble est donc visible dans les tests. Les fonctions de GitHub reproduites sont
 * celles dont dépend le comportement testé (voir le dossier TK-44, 03-red-44a.md).
 */
type Author = { name: string; email: string; date: string };
type StoredCommit = {
  sha: string;
  message: string;
  author: Author;
  parents: string[];
  tree: string;
};
type Repo = {
  id: number;
  owner: string;
  name: string;
  branches: Map<string, string>;
  commits: Map<string, StoredCommit>;
  /** arbre -> (chemin -> SHA de blob) ; seuls les fichiers sont stockés. */
  trees: Map<string, Map<string, { sha: string; mode: string }>>;
  blobs: Map<string, string>;
};

export type MockGitServerOptions = {
  /** Appelé juste avant d'avancer une branche : permet de simuler une écriture concurrente. */
  readonly beforeRefUpdate?: (server: MockGitServer, repo: string, branch: string) => void;
  /** Répond `truncated: true` à la lecture récursive d'un arbre. */
  readonly truncatedTrees?: boolean;
};

export type MockGitServer = MockGitHub & {
  /** Ajoute un commit (fichiers écrits ou, avec `null`, supprimés) en tête de la branche, hors adaptateur. */
  readonly advance: (
    repo: string,
    branch: string,
    files: Readonly<Record<string, string | null>>,
  ) => string;
  readonly head: (repo: string, branch: string) => string | undefined;
  /** Requêtes de lecture de la liste de commits. */
  readonly commitListRequests: () => RecordedRequest[];
  readonly options: { beforeRefUpdate?: MockGitServerOptions["beforeRefUpdate"] };
};

const sha1 = (text: string): string => createHash("sha1").update(text).digest("hex");

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  status,
  body,
  headers,
});

export function createMockGitServer(initial: MockGitServerOptions = {}): MockGitServer {
  const mock = createMockGitHub();
  const repos = new Map<string, Repo>();
  const overrides = new Map<string, Parameters<MockGitHub["route"]>[1]>();
  const options: MockGitServer["options"] = { beforeRefUpdate: initial.beforeRefUpdate };
  let counter = 0;
  let repoIds = 7000;
  let clock = Date.parse("2026-10-30T12:00:00.000Z");

  const tick = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const newSha = (...parts: string[]) => sha1(`${++counter}:${parts.join("|")}`);

  const treeOf = (repo: Repo, commit: StoredCommit) => repo.trees.get(commit.tree) ?? new Map();

  function storeTree(repo: Repo, files: Map<string, { sha: string; mode: string }>): string {
    const id = newSha("tree", ...[...files.keys()]);
    repo.trees.set(id, files);
    return id;
  }

  function storeCommit(repo: Repo, input: Omit<StoredCommit, "sha">): StoredCommit {
    const commit = { ...input, sha: newSha("commit", input.message, input.tree) };
    repo.commits.set(commit.sha, commit);
    return commit;
  }

  function resolve(repo: Repo, ref: string): StoredCommit | undefined {
    const sha = repo.branches.get(ref) ?? (repo.commits.has(ref) ? ref : undefined);
    return sha === undefined ? undefined : repo.commits.get(sha);
  }

  function create(owner: string, name: string): Repo {
    const repo: Repo = {
      id: ++repoIds,
      owner,
      name,
      branches: new Map(),
      commits: new Map(),
      trees: new Map(),
      blobs: new Map(),
    };
    const blob = newSha("blob", "readme");
    repo.blobs.set(blob, `# ${name}\n`);
    const tree = storeTree(repo, new Map([["README.md", { sha: blob, mode: "100644" }]]));
    const first = storeCommit(repo, {
      message: "Initial commit",
      author: { name: "GitHub", email: "noreply@github.com", date: tick() },
      parents: [],
      tree,
    });
    repo.branches.set("main", first.sha);
    repos.set(`${owner}/${name}`, repo);
    return repo;
  }

  const repoBody = (repo: Repo) => ({
    id: repo.id,
    name: repo.name,
    private: true,
    default_branch: "main",
    html_url: `https://github.com/${repo.owner}/${repo.name}`,
    owner: { login: repo.owner, type: "Organization" },
  });

  const commitBody = (commit: StoredCommit) => ({
    sha: commit.sha,
    message: commit.message,
    author: commit.author,
    committer: commit.author,
    tree: { sha: commit.tree },
    parents: commit.parents.map((sha) => ({ sha })),
    commit: {
      message: commit.message,
      author: commit.author,
      committer: commit.author,
      tree: { sha: commit.tree },
    },
  });

  function advance(
    repo: Repo,
    branch: string,
    files: Readonly<Record<string, string | null>>,
  ): StoredCommit {
    const head = repo.commits.get(repo.branches.get(branch) as string) as StoredCommit;
    const next = new Map(treeOf(repo, head));
    for (const [path, content] of Object.entries(files)) {
      if (content === null) next.delete(path);
      else {
        const blob = newSha("blob", path, content);
        repo.blobs.set(blob, content);
        next.set(path, { sha: blob, mode: "100644" });
      }
    }
    const commit = storeCommit(repo, {
      message: "concurrent write",
      author: { name: "Autre", email: "autre@example.org", date: tick() },
      parents: [head.sha],
      tree: storeTree(repo, next),
    });
    repo.branches.set(branch, commit.sha);
    return commit;
  }

  type TreeEntry = {
    path: string;
    mode?: string;
    type?: string;
    content?: string;
    sha?: string | null;
  };

  /** Applique les entrées d'un POST /git/trees : `sha: null` supprime, `content` écrit. */
  function applyTreeEntries(
    repo: Repo,
    files: Map<string, { sha: string; mode: string }>,
    entries: readonly TreeEntry[],
  ): Map<string, { sha: string; mode: string }> | undefined {
    for (const entry of entries) {
      const mode = entry.mode ?? "100644";
      if (entry.sha === null) {
        files.delete(entry.path);
      } else if (typeof entry.content === "string") {
        const blob = newSha("blob", entry.path, entry.content);
        repo.blobs.set(blob, entry.content);
        files.set(entry.path, { sha: blob, mode });
      } else if (typeof entry.sha === "string" && repo.blobs.has(entry.sha)) {
        files.set(entry.path, { sha: entry.sha, mode });
      } else {
        return undefined;
      }
    }
    return files;
  }

  /** Entrées d'un GET /git/trees : tout l'arbre (récursif) ou le premier niveau seulement. */
  function listTree(files: ReadonlyMap<string, { sha: string; mode: string }>, recursive: boolean) {
    const entries = new Map<string, { path: string; mode: string; type: string; sha: string }>();
    for (const [path, file] of files) {
      const parts = path.split("/");
      const depth = recursive ? parts.length - 1 : Math.min(1, parts.length - 1);
      for (let i = 1; i <= depth; i++) {
        const dir = parts.slice(0, i).join("/");
        entries.set(dir, { path: dir, mode: "040000", type: "tree", sha: sha1(dir) });
      }
      if (recursive || parts.length === 1) {
        entries.set(path, { path, mode: file.mode, type: "blob", sha: file.sha });
      }
    }
    return [...entries.values()];
  }

  const recordOf = (input: string | URL | Request, init?: RequestInit): RecordedRequest => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = Object.entries((init?.headers ?? {}) as Record<string, string>);
    return {
      method: (init?.method ?? "GET").toUpperCase(),
      path: url.pathname,
      query: url.searchParams,
      headers: Object.fromEntries(headers.map(([k, v]) => [k.toLowerCase(), String(v)])),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
  };

  type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
  const replyTo = (recorded: RecordedRequest): Reply | Error => {
    const key = `${recorded.method} ${recorded.path}`;
    const override = overrides.get(key);
    const reply =
      override === undefined
        ? dispatch(recorded)
        : typeof override === "function"
          ? override(recorded)
          : override;
    if (reply !== undefined) return reply;
    mock.unmatched.push(key);
    return notFound();
  };

  const isAncestor = (repo: Repo, ancestor: string, descendant: string): boolean => {
    for (let at: string | undefined = descendant; at !== undefined; ) {
      if (at === ancestor) return true;
      at = repo.commits.get(at)?.parents[0];
    }
    return false;
  };

  const notFound = () => json(404, { message: "Not Found" });
  const body = (request: RecordedRequest) => (request.body ?? {}) as Record<string, unknown>;

  type Handler = (m: RegExpExecArray, request: RecordedRequest) => ReturnType<typeof json>;
  const routes: Array<[string, RegExp, Handler]> = [];
  const on = (method: string, pattern: string, handler: Handler) =>
    routes.push([method, new RegExp(`^${pattern}$`), handler]);
  const withRepo =
    (
      handler: (
        repo: Repo,
        m: RegExpExecArray,
        request: RecordedRequest,
      ) => ReturnType<typeof json>,
    ): Handler =>
    (m, request) => {
      const repo = repos.get(`${m[1]}/${m[2]}`);
      return repo === undefined ? notFound() : handler(repo, m, request);
    };
  const REPO = "/repos/([^/]+)/([^/]+)";

  on("POST", "/orgs/([^/]+)/repos", (m, request) => {
    const name = String(body(request).name);
    if (repos.has(`${m[1]}/${name}`)) {
      return json(422, {
        message: "Repository creation failed.",
        errors: [{ message: "name already exists on this account" }],
      });
    }
    return json(201, repoBody(create(m[1] as string, name)));
  });
  on(
    "GET",
    REPO,
    withRepo((repo) => json(200, repoBody(repo))),
  );

  on(
    "GET",
    `${REPO}/commits`,
    withRepo((repo, _m, request) => {
      const ref = request.query.get("sha") ?? "main";
      let current = resolve(repo, ref);
      if (current === undefined) return notFound();
      const perPage = Math.min(Number(request.query.get("per_page") ?? "30"), 100);
      const page = Number(request.query.get("page") ?? "1");
      const all: StoredCommit[] = [];
      for (; current !== undefined; current = repo.commits.get(current.parents[0] ?? "")) {
        all.push(current);
      }
      const slice = all.slice((page - 1) * perPage, page * perPage);
      const more = all.length > page * perPage;
      const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/commits?sha=${ref}&per_page=${perPage}&page=${page + 1}`;
      return json(200, slice.map(commitBody), more ? { link: `<${url}>; rel="next"` } : {});
    }),
  );
  on(
    "GET",
    `${REPO}/commits/(.+)`,
    withRepo((repo, m) => {
      const commit = resolve(repo, decodeURIComponent(m[3] as string));
      return commit === undefined ? notFound() : json(200, commitBody(commit));
    }),
  );

  on(
    "GET",
    `${REPO}/git/ref/heads/(.+)`,
    withRepo((repo, m) => {
      const sha = repo.branches.get(decodeURIComponent(m[3] as string));
      return sha === undefined
        ? notFound()
        : json(200, { ref: `refs/heads/${m[3]}`, object: { sha, type: "commit" } });
    }),
  );
  on(
    "POST",
    `${REPO}/git/refs`,
    withRepo((repo, _m, request) => {
      const { ref, sha } = body(request) as { ref: string; sha: string };
      const name = ref.replace(/^refs\/heads\//, "");
      if (repo.branches.has(name)) return json(422, { message: "Reference already exists" });
      if (!repo.commits.has(sha)) return json(422, { message: "Object does not exist" });
      repo.branches.set(name, sha);
      return json(201, { ref, object: { sha, type: "commit" } });
    }),
  );
  on(
    "PATCH",
    `${REPO}/git/refs/heads/(.+)`,
    withRepo((repo, m, request) => {
      const branch = decodeURIComponent(m[3] as string);
      options.beforeRefUpdate?.(server, `${repo.owner}/${repo.name}`, branch);
      const head = repo.branches.get(branch);
      if (head === undefined) return notFound();
      const { sha, force } = body(request) as { sha: string; force?: boolean };
      if (!repo.commits.has(sha)) return json(422, { message: "Object does not exist" });
      if (force !== true && !isAncestor(repo, head, sha)) {
        return json(422, { message: "Update is not a fast forward" });
      }
      repo.branches.set(branch, sha);
      return json(200, { ref: `refs/heads/${branch}`, object: { sha, type: "commit" } });
    }),
  );

  on(
    "GET",
    `${REPO}/git/commits/([0-9a-f]{40})`,
    withRepo((repo, m) => {
      const commit = repo.commits.get(m[3] as string);
      return commit === undefined ? notFound() : json(200, commitBody(commit));
    }),
  );
  on(
    "POST",
    `${REPO}/git/commits`,
    withRepo((repo, _m, request) => {
      const input = body(request) as {
        message: string;
        tree: string;
        parents: string[];
        author: { name: string; email: string; date?: string };
      };
      if (!repo.trees.has(input.tree)) return json(422, { message: "Tree SHA does not exist" });
      const commit = storeCommit(repo, {
        message: input.message,
        author: { name: input.author.name, email: input.author.email, date: tick() },
        parents: input.parents,
        tree: input.tree,
      });
      return json(201, commitBody(commit));
    }),
  );
  on(
    "POST",
    `${REPO}/git/trees`,
    withRepo((repo, _m, request) => {
      const input = body(request) as {
        base_tree?: string;
        tree: Array<{
          path: string;
          mode?: string;
          type?: string;
          content?: string;
          sha?: string | null;
        }>;
      };
      const base = input.base_tree === undefined ? undefined : repo.trees.get(input.base_tree);
      if (input.base_tree !== undefined && base === undefined) {
        return json(422, { message: "base_tree does not exist" });
      }
      const next = applyTreeEntries(repo, new Map(base ?? []), input.tree);
      if (next === undefined) return json(422, { message: "Invalid tree entry" });
      return json(201, { sha: storeTree(repo, next) });
    }),
  );
  on(
    "GET",
    `${REPO}/git/trees/(.+)`,
    withRepo((repo, m, request) => {
      const key = decodeURIComponent(m[3] as string);
      const files =
        repo.trees.get(key) ??
        (() => {
          const commit = resolve(repo, key);
          return commit === undefined ? undefined : repo.trees.get(commit.tree);
        })();
      if (files === undefined) return notFound();
      const recursive = ["1", "true"].includes(request.query.get("recursive") ?? "");
      return json(200, {
        sha: sha1([...files.keys()].join()),
        tree: listTree(files, recursive),
        truncated: recursive && initial.truncatedTrees === true,
      });
    }),
  );
  on(
    "GET",
    `${REPO}/contents/(.+)`,
    withRepo((repo, m, request) => {
      const commit = resolve(repo, request.query.get("ref") ?? "main");
      const path = decodeURIComponent(m[3] as string);
      const file = commit === undefined ? undefined : treeOf(repo, commit).get(path);
      if (file === undefined) return notFound();
      return json(200, {
        type: "file",
        path,
        sha: file.sha,
        encoding: "base64",
        content: Buffer.from(repo.blobs.get(file.sha) ?? "", "utf8").toString("base64"),
      });
    }),
  );

  const dispatch = (request: RecordedRequest) => {
    for (const [method, pattern, handler] of routes) {
      const match = method === request.method ? pattern.exec(request.path) : null;
      if (match !== null) return handler(match, request);
    }
    return undefined;
  };

  const server = mock as MockGitServer;
  mock.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const recorded = recordOf(input, init);
    mock.requests.push(recorded);
    const reply = replyTo(recorded);
    if (reply instanceof Error) throw reply;
    const response = new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json; charset=utf-8", ...(reply.headers ?? {}) },
    });
    return Object.defineProperty(response, "url", {
      value: new URL(input instanceof Request ? input.url : String(input)).toString(),
    });
  }) as typeof fetch;

  Object.assign(server, {
    route: (key: string, route: Parameters<MockGitHub["route"]>[1]) =>
      void overrides.set(key, route),
    advance: (repoKey: string, branch: string, files: Record<string, string | null>) =>
      advance(repos.get(repoKey) as Repo, branch, files).sha,
    head: (repoKey: string, branch: string) => repos.get(repoKey)?.branches.get(branch),
    commitListRequests: () =>
      mock.requests.filter(
        (r) => r.method === "GET" && /\/repos\/[^/]+\/[^/]+\/commits$/.test(r.path),
      ),
    options,
  });
  return server;
}
