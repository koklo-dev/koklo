"use client";

import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { ITEM_ACTIVE, type ShellLink, useShell } from "./app-shell.tsx";
import { Skeleton } from "./skeleton.tsx";
import { PILL_TONE } from "./status-pill.ts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.tsx";

export type SpecKey =
  | "functional"
  | "data"
  | "architecture"
  | "technical"
  | "security"
  | "design"
  | "quality";

export interface SpecDeliverable {
  key: SpecKey;
  label: string;
  icon: IconName;
  /** Condition affichée tant que l'entrée est verrouillée (« Disponible <condition> »). */
  condition: string;
}

/** Les sept livrables dans l'ordre de rédaction (décision 21 §0, planche 10). Le rang est l'index + 1. */
export const SPEC_DELIVERABLES: readonly SpecDeliverable[] = [
  {
    key: "functional",
    label: "Fonctionnel",
    icon: "task_alt",
    condition: "une fois le projet chargé",
  },
  { key: "data", label: "Données", icon: "database", condition: "après le fonctionnel" },
  {
    key: "architecture",
    label: "Architecture",
    icon: "account_tree",
    condition: "après les données",
  },
  { key: "technical", label: "Technique", icon: "terminal", condition: "après l'architecture" },
  { key: "security", label: "Sécurité", icon: "shield", condition: "après le technique" },
  { key: "design", label: "Design", icon: "palette", condition: "après le fonctionnel" },
  {
    key: "quality",
    label: "Qualité",
    icon: "fact_check",
    condition: "après le technique, la sécurité et le design",
  },
];

/** Pastille d'une entrée (maquette 10 l.686-712) : `soft` (Prêt, …), `primary` (N à relire), `pending` (À valider, ambre). */
export interface SpecBadge {
  label: string;
  tone: "soft" | "primary" | "pending";
}

const BADGE_TONE: Record<SpecBadge["tone"], string> = {
  soft: PILL_TONE.soft,
  primary: PILL_TONE.primary,
  pending: PILL_TONE.warning,
};

export interface SpecNavProps {
  /** Lien de chaque livrable disponible ; une clé absente est verrouillée (fermé par défaut). */
  hrefs: Partial<Record<SpecKey, string>>;
  activeKey?: SpecKey;
  /** Pastille par livrable disponible (un seul badge par entrée) ; absente : aucune pastille. */
  badges?: Partial<Record<SpecKey, SpecBadge>>;
  /** Livrables validés sur sept ; 0 tant qu'aucun n'est validable. */
  validatedCount?: number;
  loading?: boolean;
  LinkComponent?: ShellLink;
}

const ROW = "h-8 [@media(max-height:900px)]:h-7 gap-2 text-meta";
const GROUP_LABEL = "text-group-label uppercase text-muted-foreground";

function Row({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex w-full items-center rounded-md border border-transparent px-2.5",
        ROW,
        className,
      )}
      {...props}
    />
  );
}

function LockedEntry({ deliverable, rank }: { deliverable: SpecDeliverable; rank: number }) {
  const { collapsed } = useShell();
  const condition = `Disponible ${deliverable.condition}`;
  const name = `${deliverable.label}, disponible ${deliverable.condition}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-disabled="true"
          aria-label={name}
          onClick={(event) => event.preventDefault()}
          className={cn(
            "flex h-8 [@media(max-height:900px)]:h-7 w-full items-center gap-2 rounded-md border border-transparent px-2.5 text-left text-meta text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? null : <Rank rank={rank} />}
          <Icon name={deliverable.icon} size={18} />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate">{deliverable.label}</span>
              <Icon
                data-slot="spec-lock"
                name="lock"
                size={16}
                className="size-3.5 text-border-strong"
              />
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{condition}</TooltipContent>
    </Tooltip>
  );
}

/** Numéro tiré d'un attribut par CSS : hors du texte visible, il ne fausse pas WCAG 2.5.3 (nom contenant le libellé). */
function Rank({ rank }: { rank: number }) {
  return (
    <span
      data-slot="spec-number"
      data-rank={rank}
      aria-hidden="true"
      className="w-3 shrink-0 font-mono text-[11px] text-muted-foreground after:content-[attr(data-rank)]"
    />
  );
}

function EntryBadge({ badge }: { badge: SpecBadge }) {
  return (
    <span
      data-slot="spec-badge"
      data-tone={badge.tone}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-[7px] py-px text-[11px] font-semibold",
        BADGE_TONE[badge.tone],
      )}
    >
      <span className="sr-only">{", "}</span>
      {badge.label}
    </span>
  );
}

function AvailableEntry({
  deliverable,
  rank,
  href,
  active,
  badge,
  Link,
}: {
  deliverable: SpecDeliverable;
  rank: number;
  href: string;
  active: boolean;
  badge: SpecBadge | undefined;
  Link: ShellLink;
}) {
  const { collapsed } = useShell();
  const collapsedName = `Spec · ${deliverable.label}${badge ? ` · ${badge.label}` : ""}`;
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? collapsedName : undefined}
      className={cn(
        "flex h-8 [@media(max-height:900px)]:h-7 w-full items-center gap-2 rounded-md border border-transparent px-2.5 text-meta text-sidebar-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed && "justify-center px-0",
        active && ITEM_ACTIVE,
      )}
    >
      {collapsed ? null : <Rank rank={rank} />}
      <Icon
        name={deliverable.icon}
        size={18}
        fill={active}
        className={active ? "text-primary" : "text-muted-foreground"}
      />
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{deliverable.label}</span>}
      {collapsed || !badge ? null : <EntryBadge badge={badge} />}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{collapsedName}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Groupe SPEC de la barre (DESIGN.md §5.4) : sept entrées numérotées, compteur « N/7 », sans chevron ni
 * repli. Une entrée sans lien est un bouton `aria-disabled` focalisable dont la condition est dans l'infobulle.
 */
export function SpecNav({
  hrefs,
  activeKey,
  badges = {},
  validatedCount = 0,
  loading = false,
  LinkComponent: Link = "a" as unknown as ShellLink,
}: SpecNavProps) {
  const { collapsed } = useShell();
  return (
    <TooltipProvider>
      {/* biome-ignore lint/a11y/useSemanticElements: groupe nommé de liens (pas un formulaire), un fieldset serait faux */}
      <div
        role="group"
        aria-label="Spec"
        aria-busy={loading || undefined}
        data-slot="spec-nav"
        className="flex flex-col gap-px"
      >
        {collapsed ? (
          <span
            data-slot="spec-rule"
            aria-hidden="true"
            className="mx-auto my-2 h-px w-6 bg-border-strong"
          />
        ) : (
          <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
            <span aria-hidden="true" className={GROUP_LABEL}>
              Spec
            </span>
            <span className="font-mono text-xs font-medium text-muted-foreground">
              <span className="font-mono">{`${validatedCount}/7`}</span>
              <span className="sr-only"> livrables validés</span>
            </span>
          </div>
        )}
        <ul className="flex flex-col gap-px">
          {SPEC_DELIVERABLES.map((deliverable, index) => (
            <li key={deliverable.key}>
              {loading ? (
                <Row>
                  <Skeleton className="h-3 w-full" />
                </Row>
              ) : hrefs[deliverable.key] ? (
                <AvailableEntry
                  deliverable={deliverable}
                  rank={index + 1}
                  href={hrefs[deliverable.key] as string}
                  active={activeKey === deliverable.key}
                  badge={badges[deliverable.key]}
                  Link={Link}
                />
              ) : (
                <LockedEntry deliverable={deliverable} rank={index + 1} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </TooltipProvider>
  );
}
