import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";
import { ProgressBar } from "./progress-bar.tsx";
import type { ProposalReviewCounts, ProposalSaveProgress } from "./proposal-review-types.ts";

export interface ProposalReviewBannerProps {
  counts: ProposalReviewCounts;
  onSave?: () => void;
  saving?: boolean;
  /** Pendant l'enregistrement : la barre passe en vert (part écrite, puis part en cours qui pulse). */
  saveProgress?: ProposalSaveProgress | undefined;
  onLeave: () => void;
  className?: string;
}

const plural = (n: number, one: string, other: string) => `${n} ${n >= 2 ? other : one}`;

function summary({ total, accepted, rejected, pending }: ProposalReviewCounts): string {
  return [
    ` · ${plural(total, "proposition", "propositions")}`,
    plural(accepted, "acceptée", "acceptées"),
    plural(rejected, "rejetée", "rejetées"),
    `${pending} à relire`,
  ].join(" · ");
}

/** « Enregistrement · lot 2 sur 3 · 200 sur 512 » : texte visible qui double la barre verte (jamais la couleur seule). */
export function saveProgressText({ saved, total, batch, batches }: ProposalSaveProgress): string {
  const lot = batches > 1 ? ` · lot ${batch} sur ${batches}` : "";
  return `Enregistrement${lot} · ${saved} sur ${total}`;
}

function Gauge({
  counts,
  progress,
}: {
  counts: ProposalReviewCounts;
  progress: ProposalSaveProgress | undefined;
}) {
  if (progress) {
    const of = (n: number) => (progress.total > 0 ? (n / progress.total) * 100 : 0);
    return (
      <ProgressBar
        aria-label="Avancement de l'enregistrement"
        aria-valuetext={`${progress.saved} enregistrées sur ${progress.total}`}
        tone="success"
        value={of(progress.saved)}
        pending={of(progress.sending)}
        className="flex-[1_0_100%]"
      />
    );
  }
  const share = (n: number) => (counts.total > 0 ? (n / counts.total) * 100 : 0);
  return (
    <ProgressBar
      aria-label="Avancement de la relecture"
      aria-valuetext={`${counts.accepted} acceptées sur ${counts.total}`}
      variant="split"
      value={share(counts.accepted)}
      secondary={share(counts.rejected)}
      className="flex-[1_0_100%]"
    />
  );
}

/** Bandeau de la relecture (maquette 10 l.114-124) : décompte, barre à deux segments, enregistrer, quitter. */
export function ProposalReviewBanner({
  counts,
  onSave,
  saving,
  saveProgress,
  onLeave,
  className,
}: ProposalReviewBannerProps) {
  const progress = saving ? saveProgress : undefined;
  return (
    // biome-ignore lint/a11y/useSemanticElements: bandeau d'état nommé, pas un jeu de champs
    <div
      role="group"
      aria-label="Mode relecture"
      data-slot="proposal-review-banner"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border bg-diff-bg px-4 py-2.5 md:px-7",
        className,
      )}
    >
      <Icon name="wand_stars" size={18} tone="primary" />
      <span className="text-meta">
        <strong className="font-semibold">Mode relecture</strong>
        {summary(counts)}
      </span>
      {progress ? (
        <span data-slot="proposal-save-progress" className="text-meta text-muted-foreground">
          {saveProgressText(progress)}
        </span>
      ) : null}
      <span className="flex-1" />
      {counts.accepted > 0 && onSave ? (
        <Button size="sm" icon="add" loading={saving} onClick={onSave} className="h-11 md:h-8">
          {`Enregistrer ${counts.accepted} dans la spec`}
        </Button>
      ) : (
        <span className="text-caption font-normal text-muted-foreground">
          Acceptez au moins une proposition pour enregistrer.
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={onLeave}
        disabled={saving}
        className="h-11 md:h-8"
      >
        Quitter la relecture
      </Button>
      <Gauge counts={counts} progress={progress} />
    </div>
  );
}
