import { errorCode, errorData } from "./api-error.ts";
import type { SaveState } from "./idea-labels.ts";

export const AUTOSAVE_DELAY_MS = 1500;

export interface IdeaSaverDeps {
  save: (input: { contentMd: string; baseVersion: number }) => Promise<{ version: number }>;
  onState: (state: SaveState) => void;
  onConflict: (info: { mine: string; currentVersion: number }) => void;
  /** Copie locale écrite à chaque frappe : la saisie ne dépend jamais du réseau. */
  persistLocal: (contentMd: string, baseVersion: number) => void;
  clearLocal: () => void;
  onSaved?: (version: number) => void;
  delayMs?: number;
}

/**
 * Enregistrement automatique d'une page : copie locale à chaque frappe, envoi 1,5 s après la dernière frappe ou à
 * la perte du focus, un seul envoi à la fois. Conflit : la saisie reste (copie locale et mémoire), plus aucun envoi
 * tant que l'utilisateur n'a pas choisi. Réseau coupé : « hors ligne », la copie locale garde tout et un nouvel
 * essai part à la frappe suivante ou au retour du réseau (`retry`).
 */
export class IdeaSaver {
  private version: number;
  private saved: string;
  private latest: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight = false;
  private again = false;
  private conflicted = false;
  private disposed = false;

  constructor(
    private readonly deps: IdeaSaverDeps,
    initial: { version: number; contentMd: string },
  ) {
    this.version = initial.version;
    this.saved = initial.contentMd;
    this.latest = initial.contentMd;
  }

  private cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Envoi de ce qui attend ; perte de focus, changement de page et démontage l'appellent aussi. */
  flush = async (): Promise<void> => {
    this.cancel();
    if (this.disposed || this.conflicted || this.latest === this.saved) return;
    if (this.inFlight) {
      this.again = true;
      return;
    }
    this.inFlight = true;
    try {
      await this.send(this.latest);
    } finally {
      this.inFlight = false;
    }
    if (this.again && !this.conflicted) {
      this.again = false;
      await this.flush();
    }
  };

  retry = this.flush;

  private async send(sent: string): Promise<void> {
    this.deps.onState("saving");
    try {
      const result = await this.deps.save({ contentMd: sent, baseVersion: this.version });
      this.version = result.version;
      this.saved = sent;
      if (this.latest === sent) this.deps.clearLocal();
      this.deps.onSaved?.(this.version);
      this.deps.onState("saved");
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    const code = errorCode(error);
    if (code !== "CONFLICT") {
      this.deps.onState(code === undefined ? "offline" : "error");
      return;
    }
    this.conflicted = true;
    const current = errorData(error)?.currentVersion;
    this.deps.onState("conflict");
    this.deps.onConflict({
      mine: this.latest,
      currentVersion: typeof current === "number" ? current : this.version,
    });
  }

  change = (contentMd: string): void => {
    this.latest = contentMd;
    if (contentMd === this.saved) {
      this.cancel();
      this.deps.clearLocal();
      return;
    }
    this.deps.persistLocal(contentMd, this.version);
    if (this.conflicted) return;
    this.cancel();
    this.timer = setTimeout(() => void this.flush(), this.deps.delayMs ?? AUTOSAVE_DELAY_MS);
  };

  /** « Garder la mienne » : la saisie repart sur la version courante du serveur. */
  keepMine = (currentVersion: number): Promise<void> => {
    this.version = currentVersion;
    this.conflicted = false;
    return this.flush();
  };

  /** « Prendre la leur » : le contenu du serveur remplace la saisie. */
  takeTheirs = (currentVersion: number, contentMd: string): void => {
    this.version = currentVersion;
    this.saved = contentMd;
    this.latest = contentMd;
    this.conflicted = false;
    this.cancel();
    this.deps.clearLocal();
    this.deps.onState("saved");
  };

  dispose = (): void => {
    this.disposed = true;
    this.cancel();
  };
}

export const createIdeaSaver = (
  deps: IdeaSaverDeps,
  initial: { version: number; contentMd: string },
): IdeaSaver => new IdeaSaver(deps, initial);
