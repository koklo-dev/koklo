import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";
import { ProgressBar } from "./progress-bar.tsx";
import type { ProposalReviewCounts } from "./proposal-review-types.ts";

export interface ProposalReviewBannerProps {
  counts: ProposalReviewCounts;
  onSave?: () => void;
  saving?: boolean;
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

/** Bandeau de la relecture (maquette 10 l.114-124) : décompte, barre à deux segments, enregistrer, quitter. */
export function ProposalReviewBanner({
  counts,
  onSave,
  saving,
  onLeave,
  className,
}: ProposalReviewBannerProps) {
  const share = (n: number) => (counts.total > 0 ? (n / counts.total) * 100 : 0);
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
      <Button size="sm" variant="outline" onClick={onLeave} className="h-11 md:h-8">
        Quitter la relecture
      </Button>
      <ProgressBar
        aria-label="Avancement de la relecture"
        aria-valuetext={`${counts.accepted} acceptées sur ${counts.total}`}
        variant="split"
        value={share(counts.accepted)}
        secondary={share(counts.rejected)}
        className="flex-[1_0_100%]"
      />
    </div>
  );
}
