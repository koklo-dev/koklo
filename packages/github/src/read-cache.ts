import {
  type FileContent,
  type FileListing,
  GitNotFoundError,
  type GitProvider,
  GitRateLimitedError,
  type RepoRef,
} from "@koklo/domain";

/** Bornes par défaut du cache de lecture (TK-114f, B689) : mémoire, entrées, arbres de commit, durée de vie. */
export const GIT_READ_CACHE_MAX_BYTES = 32 * 1024 * 1024;
export const GIT_READ_CACHE_MAX_ENTRIES = 5000;
export const GIT_READ_CACHE_MAX_LISTINGS = 64;
export const GIT_READ_CACHE_TTL_MS = 3_600_000;
/** Un contenu plus long (en caractères) n'est jamais gardé. */
export const GIT_READ_CACHE_MAX_CONTENT_CHARS = 1024 * 1024;

/** Frein d'une installation au quota épuisé (B690) : 60 s sans délai annoncé, 1 h au plus. */
const BRAKE_DEFAULT_MS = 60_000;
const BRAKE_MAX_MS = 3_600_000;
const BYTES_PER_CHAR = 2;
const SHA_CHARS = 40;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const SEPARATOR = "\u0000";

export type GitReadCacheOptions = {
  readonly maxBytes?: number;
  readonly maxEntries?: number;
  readonly maxListings?: number;
  readonly ttlMs?: number;
  /** Horloge en millisecondes (tests). */
  readonly now?: () => number;
};

/** `file` : chemin d'un commit vers son blob ; `missing` : chemin absent du commit (404 gardé). */
type Cached =
  | { readonly kind: "blob"; readonly content: string }
  | { readonly kind: "file"; readonly sha: string }
  | { readonly kind: "missing" }
  | { readonly kind: "listing"; readonly listing: FileListing };

type Entry = { readonly value: Cached; readonly bytes: number; readonly expiresAt: number };

const sizeOf = (value: Cached): number => {
  if (value.kind === "blob") return value.content.length * BYTES_PER_CHAR;
  if (value.kind !== "listing") return 0;
  const chars = value.listing.files.reduce((sum, file) => sum + file.path.length + SHA_CHARS, 0);
  return chars * BYTES_PER_CHAR;
};

const tooLarge = (value: Cached): boolean =>
  value.kind === "blob" && value.content.length > GIT_READ_CACHE_MAX_CONTENT_CHARS;

/** Délai de frein borné ; absent, non fini ou nul : le délai par défaut. */
const brakeOf = (retryAfterMs: number | undefined): number =>
  retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? Math.min(retryAfterMs, BRAKE_MAX_MS)
    : BRAKE_DEFAULT_MS;

/**
 * Mémoire des lectures git d'un processus (LRU sur `Map`), partagée par toutes les installations : la portée est dans la
 * clé (`cachedGitReads`). Une entrée expirée est absente. Garde aussi le frein par installation et les lectures en vol.
 */
export class GitReadCache {
  readonly #entries = new Map<string, Entry>();
  readonly #inFlight = new Map<string, Promise<unknown>>();
  readonly #limitedUntil = new Map<string, number>();
  readonly #maxBytes: number;
  readonly #maxEntries: number;
  readonly #maxListings: number;
  readonly #ttlMs: number;
  readonly #now: () => number;
  #bytes = 0;
  #listings = 0;

  constructor(options: GitReadCacheOptions = {}) {
    this.#maxBytes = options.maxBytes ?? GIT_READ_CACHE_MAX_BYTES;
    this.#maxEntries = options.maxEntries ?? GIT_READ_CACHE_MAX_ENTRIES;
    this.#maxListings = options.maxListings ?? GIT_READ_CACHE_MAX_LISTINGS;
    this.#ttlMs = options.ttlMs ?? GIT_READ_CACHE_TTL_MS;
    this.#now = options.now ?? Date.now;
  }

  /** Entrée valide (remise en tête de l'ordre LRU), sinon `undefined`. */
  get(key: string): Cached | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    this.#remove(key, entry);
    if (entry.expiresAt <= this.#now()) return undefined;
    this.#insert(key, entry);
    return entry.value;
  }

  set(key: string, value: Cached): void {
    const bytes = sizeOf(value);
    if (bytes > this.#maxBytes || tooLarge(value)) return;
    const previous = this.#entries.get(key);
    if (previous !== undefined) this.#remove(key, previous);
    this.#insert(key, { value, bytes, expiresAt: this.#now() + this.#ttlMs });
    this.#evict();
  }

  /** Une seule requête réseau pour des lectures identiques simultanées. */
  shared<T>(key: string, run: () => Promise<T>): Promise<T> {
    const pending = this.#inFlight.get(key);
    if (pending !== undefined) return pending as Promise<T>;
    const started = run().finally(() => this.#inFlight.delete(key));
    this.#inFlight.set(key, started);
    return started;
  }

  /** Délai restant du frein de l'installation, `undefined` quand elle n'est pas limitée. */
  brakeRemaining(installationId: string): number | undefined {
    const until = this.#limitedUntil.get(installationId);
    if (until === undefined) return undefined;
    const remaining = until - this.#now();
    if (remaining > 0) return remaining;
    this.#limitedUntil.delete(installationId);
    return undefined;
  }

  brake(installationId: string, retryAfterMs: number | undefined): void {
    this.#limitedUntil.set(installationId, this.#now() + brakeOf(retryAfterMs));
  }

  #insert(key: string, entry: Entry): void {
    this.#entries.set(key, entry);
    this.#bytes += entry.bytes;
    if (entry.value.kind === "listing") this.#listings += 1;
  }

  #remove(key: string, entry: Entry): void {
    this.#entries.delete(key);
    this.#bytes -= entry.bytes;
    if (entry.value.kind === "listing") this.#listings -= 1;
  }

  #evict(): void {
    for (const [key, entry] of this.#entries) {
      if (this.#bytes <= this.#maxBytes && this.#entries.size <= this.#maxEntries) break;
      this.#remove(key, entry);
    }
    for (const [key, entry] of this.#entries) {
      if (this.#listings <= this.#maxListings) break;
      if (entry.value.kind === "listing") this.#remove(key, entry);
    }
  }
}

type ReadRequest = Parameters<GitProvider["readFile"]>[0];
type ListRequest = Parameters<GitProvider["listFiles"]>[0];

const isFullSha = (ref: string): boolean => FULL_SHA.test(ref);
const keyOf = (...parts: string[]): string => parts.join(SEPARATOR);

/** Lectures d'une installation : seules les refs SHA complètes sont servies par le cache. */
class CachedReads {
  constructor(
    private readonly provider: GitProvider,
    private readonly cache: GitReadCache,
    private readonly installationId: string,
  ) {}

  readonly readFile = async (request: ReadRequest): Promise<FileContent> => {
    if (!isFullSha(request.ref)) {
      return this.#network("readFile", () => this.provider.readFile(request));
    }
    const base = this.#base(request.repo);
    const ref = request.ref.toLowerCase();
    const sha = this.#knownBlobSha(base, ref, request.path);
    if (sha === null) throw notFound(request);
    const stored = sha === undefined ? undefined : this.cache.get(keyOf(base, `blob:${sha}`));
    if (stored?.kind === "blob") {
      return { path: request.path, ref: request.ref, content: stored.content, sha: sha as string };
    }
    const key = keyOf(base, `file:${ref}:${request.path}`);
    return this.cache.shared(key, () => this.#fetchFile(base, key, request));
  };

  readonly listFiles = async (request: ListRequest): Promise<FileListing> => {
    const base = this.#base(request.repo);
    const direct = () => this.#network("listFiles", () => this.provider.listFiles(request));
    if (!isFullSha(request.ref)) return this.#remember(base, await direct());
    const key = keyOf(base, `tree:${request.ref.toLowerCase()}`);
    const stored = this.cache.get(key);
    if (stored?.kind === "listing") return stored.listing;
    return this.cache.shared(key, async () => this.#remember(base, await direct()));
  };

  /** Blob d'un chemin au commit : par l'arbre gardé, sinon par une lecture gardée ; `null` : absent. */
  #knownBlobSha(base: string, ref: string, path: string): string | null | undefined {
    const tree = this.cache.get(keyOf(base, `tree:${ref}`));
    if (tree?.kind === "listing") {
      return tree.listing.files.find((file) => file.path === path)?.sha ?? null;
    }
    const file = this.cache.get(keyOf(base, `file:${ref}:${path}`));
    if (file?.kind === "missing") return null;
    return file?.kind === "file" ? file.sha : undefined;
  }

  async #fetchFile(base: string, key: string, request: ReadRequest): Promise<FileContent> {
    try {
      const file = await this.#network("readFile", () => this.provider.readFile(request));
      this.cache.set(keyOf(base, `blob:${file.sha}`), { kind: "blob", content: file.content });
      this.cache.set(key, { kind: "file", sha: file.sha });
      return file;
    } catch (error) {
      if (error instanceof GitNotFoundError) this.cache.set(key, { kind: "missing" });
      throw error;
    }
  }

  /** Un arbre lu (même par une branche) est rangé sous le SHA du commit que le fournisseur a rendu. */
  #remember(base: string, listing: FileListing): FileListing {
    if (isFullSha(listing.ref)) {
      this.cache.set(keyOf(base, `tree:${listing.ref.toLowerCase()}`), {
        kind: "listing",
        listing,
      });
    }
    return listing;
  }

  /** Appel réseau sous le frein de l'installation ; un quota épuisé le serre. */
  async #network<T>(operation: string, run: () => Promise<T>): Promise<T> {
    const remaining = this.cache.brakeRemaining(this.installationId);
    if (remaining !== undefined)
      throw new GitRateLimitedError({ operation, retryAfterMs: remaining });
    try {
      return await run();
    } catch (error) {
      if (error instanceof GitRateLimitedError) {
        this.cache.brake(this.installationId, error.retryAfterMs);
      }
      throw error;
    }
  }

  #base(repo: RepoRef): string {
    return keyOf(this.installationId, repo.owner.kind, repo.owner.login, repo.name);
  }
}

const notFound = (request: ReadRequest): GitNotFoundError =>
  new GitNotFoundError({
    operation: "readFile",
    resource: "file",
    identifier: `${request.repo.owner.login}/${request.repo.name}:${request.path}@${request.ref}`,
  });

/**
 * Fournisseur dont `readFile` et `listFiles` passent par `cache` pour l'installation `scope` (jamais `auth` dans une clé) ;
 * toutes les autres opérations, écritures comprises, sont déléguées telles quelles. Clé : installation, propriétaire, dépôt.
 */
export function cachedGitReads(
  provider: GitProvider,
  cache: GitReadCache,
  scope: { readonly installationId: string },
): GitProvider {
  const reads = new CachedReads(provider, cache, scope.installationId);
  return new Proxy(provider, {
    get(target, property) {
      if (property === "readFile") return reads.readFile;
      if (property === "listFiles") return reads.listFiles;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
