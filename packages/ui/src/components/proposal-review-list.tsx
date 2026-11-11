import { FilterChip } from "./filter-chip.tsx";
import { ProposalGroupSection } from "./proposal-review-group.tsx";
import { ProposalRow } from "./proposal-review-row.tsx";
import type {
  ProposalFilter,
  ProposalReviewCounts,
  ProposalReviewGroup,
} from "./proposal-review-types.ts";

export interface ProposalReviewListProps {
  counts: ProposalReviewCounts;
  groups: readonly ProposalReviewGroup[];
  grouped: boolean;
  filter: ProposalFilter;
  onFilterChange?: ((filter: ProposalFilter) => void) | undefined;
  selectedId?: string | undefined;
  collapsed: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  onSelect: (id: string) => void;
  onAcceptGroup?: ((key: string) => void) | undefined;
  onLoadMore?: ((key: string) => void) | undefined;
}

function EmptyNote({ counts }: { counts: ProposalReviewCounts }) {
  return (
    <p className="px-3 py-4 text-meta text-muted-foreground">
      {counts.accepted > 0
        ? `Tout est relu. Enregistrez les ${counts.accepted} acceptées.`
        : "Aucune proposition à relire."}
    </p>
  );
}

function Filters(props: ProposalReviewListProps) {
  const { counts, filter, onFilterChange } = props;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2 pt-1">
      <FilterChip
        pressed={filter === "pending"}
        onPressedChange={() => onFilterChange?.("pending")}
      >
        {`À relire · ${counts.pending}`}
      </FilterChip>
      <FilterChip pressed={filter === "all"} onPressedChange={() => onFilterChange?.("all")}>
        {`Toutes · ${counts.total}`}
      </FilterChip>
      <span className="flex-1" />
      <span className="text-[11px] font-normal text-muted-foreground">
        Groupé par type puis par zone
      </span>
    </div>
  );
}

/** Liste de 330 px (maquette 10 l.125-134) : à plat jusqu'à 30 propositions, en groupes repliables au-delà. */
export function ProposalReviewList(props: ProposalReviewListProps) {
  const { groups, grouped, selectedId, onSelect } = props;
  const loaded = groups.reduce((n, group) => n + group.items.length, 0);
  return (
    <div
      data-slot="proposal-review-list"
      className="flex max-h-[880px] min-w-0 max-w-full flex-[0_0_330px] flex-col self-start overflow-auto border-border p-2 md:border-r"
    >
      {grouped ? <Filters {...props} /> : null}
      {loaded === 0 && !grouped ? <EmptyNote counts={props.counts} /> : null}
      <ul
        // biome-ignore lint/a11y/noRedundantRoles: `list-style: none` retire la sémantique de liste dans Safari / VoiceOver
        role="list"
        aria-label={grouped ? "Propositions par groupe" : "Propositions à relire"}
        className="m-0 flex list-none flex-col gap-1 p-0"
      >
        {grouped
          ? groups.map((group) => (
              <ProposalGroupSection
                key={group.key}
                group={group}
                open={!props.collapsed.has(group.key)}
                selectedId={selectedId}
                onToggle={props.onToggleGroup}
                onSelect={onSelect}
                onAccept={props.onAcceptGroup}
                onLoadMore={props.onLoadMore}
              />
            ))
          : groups
              .flatMap((group) => group.items)
              .map((item, index, all) => (
                <ProposalRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  setSize={all.length}
                  position={index + 1}
                  onSelect={onSelect}
                />
              ))}
      </ul>
      {grouped && loaded === 0 ? <EmptyNote counts={props.counts} /> : null}
    </div>
  );
}
