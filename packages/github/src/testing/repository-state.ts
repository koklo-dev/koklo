import { createHash } from "node:crypto";
import type {
  CheckRun,
  CommitAuthor,
  Deployment,
  FileChange,
  PullRequestStatus,
  Repo,
} from "@koklo/domain";

export type FileEntry = { readonly content: string; readonly mode: string; readonly blob: string };
/** Contenu complet d'un commit : chemin -> fichier. */
export type Snapshot = ReadonlyMap<string, FileEntry>;

export type StoredCommit = {
  readonly sha: string;
  readonly message: string;
  readonly author: CommitAuthor;
  readonly parents: readonly string[];
  readonly files: Snapshot;
};

export type StoredPull = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly base: string;
  readonly head: string;
  status: PullRequestStatus;
  mergedSha?: string;
};

const sha1 = (text: string): string => createHash("sha1").update(text).digest("hex");

/** Empreinte de blob façon Git : identique pour un contenu identique. */
const blobSha = (content: string): string => sha1(`blob ${Buffer.byteLength(content)}\0${content}`);

export function withFiles(base: Snapshot, files: readonly FileChange[]): Snapshot {
  const next = new Map(base);
  for (const file of files) {
    next.set(file.path, {
      content: file.content,
      mode: file.mode ?? "100644",
      blob: blobSha(file.content),
    });
  }
  return next;
}

/** Chemins modifiés ou ajoutés dans `after` par rapport à `before` (les suppressions n'existent pas dans le port). */
const changedPaths = (before: Snapshot, after: Snapshot): string[] =>
  [...after].filter(([path, entry]) => before.get(path)?.blob !== entry.blob).map(([path]) => path);

/** Dépôt en mémoire : graphe de commits (chacun avec son contenu complet), refs, PR, checks. */
export class RepositoryState {
  readonly commits = new Map<string, StoredCommit>();
  readonly branches = new Map<string, string>();
  readonly tags = new Map<string, string>();
  readonly pulls: StoredPull[] = [];
  readonly checks: CheckRun[] = [];
  readonly deployments: Deployment[] = [];
  readonly subscriptions = new Set<string>();
  readonly repo: Repo;

  constructor(repo: Repo) {
    this.repo = repo;
  }

  /** Le SHA mêle l'identifiant injecté : deux commits identiques restent distincts, et déterministes. */
  addCommit(input: Omit<StoredCommit, "sha">, id: string): StoredCommit {
    const tree = [...input.files].map(([path, file]) => `${file.mode} ${file.blob} ${path}`).sort();
    const sha = sha1(JSON.stringify([input.parents, tree, input.message, input.author, id]));
    const commit = { ...input, sha };
    this.commits.set(sha, commit);
    return commit;
  }

  /** SHA de la tête d'une branche qui existe (les branches ne sont jamais supprimées). */
  sha(branch: string): string {
    const sha = this.branches.get(branch);
    if (sha === undefined) throw new Error(`branche inconnue : ${branch}`);
    return sha;
  }

  /** Branche, tag ou SHA complet -> SHA de commit. */
  resolve(ref: string): string | undefined {
    return (
      this.branches.get(ref) ?? this.tags.get(ref) ?? (this.commits.has(ref) ? ref : undefined)
    );
  }

  commit(sha: string): StoredCommit {
    const commit = this.commits.get(sha);
    if (commit === undefined) throw new Error(`commit inconnu : ${sha}`);
    return commit;
  }

  private ancestors(sha: string): Set<string> {
    const seen = new Set<string>();
    const stack = [sha];
    for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...this.commit(current).parents);
    }
    return seen;
  }

  /** Premier ancêtre de `head` (parcours en largeur) qui est aussi ancêtre de `base`. */
  private mergeBase(base: string, head: string): string | undefined {
    const known = this.ancestors(base);
    const queue = [head];
    const seen = new Set<string>();
    for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
      if (known.has(current)) return current;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...this.commit(current).parents);
    }
    return undefined;
  }

  /**
   * Fusion à trois voies par fichier : un chemin modifié des deux côtés avec des contenus
   * différents est un conflit. Rend le contenu fusionné, ou la liste des chemins en conflit.
   */
  mergeTrees(baseSha: string, headSha: string): { files: Snapshot } | { conflicts: string[] } {
    const base = this.commit(baseSha).files;
    const head = this.commit(headSha).files;
    const origin = this.commit(this.mergeBase(baseSha, headSha) ?? baseSha).files;
    const onBase = new Set(changedPaths(origin, base));
    const conflicts: string[] = [];
    const merged = new Map(base);
    for (const path of changedPaths(origin, head)) {
      const entry = head.get(path);
      if (entry === undefined) continue;
      if (onBase.has(path) && base.get(path)?.blob !== entry.blob) conflicts.push(path);
      else merged.set(path, entry);
    }
    return conflicts.length > 0 ? { conflicts } : { files: merged };
  }
}
