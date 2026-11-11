import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";
import { ProposalRow, ProposalRowContent } from "./proposal-review-row.tsx";
import {
  PROPOSAL_NEXT_PAGE,
  type ProposalReviewGroup,
  type ProposalReviewItem,
} from "./proposal-review-types.ts";
import { VirtualList } from "./virtual-list.tsx";

/** Au-delà, les éléments chargés d'un groupe passent par `VirtualList`. */
const VIRTUAL_FROM = 30;

export interface ProposalGroupProps {
  group: ProposalReviewGroup;
  open: boolean;
  selectedId?: string | undefined;
  onToggle: (key: string) => void;
  onSelect: (id: string) => void;
  onAccept?: ((key: string) => void) | undefined;
  onLoadMore?: ((key: string) => void) | undefined;
}

const plural = (n: number, one: string, other: string) => (n >= 2 ? other : one);

/** En-tête collant du groupe (maquette 10 l.128 et 12 l.126-148) : repli, sous-ligne de comptes, accepter les restantes. */
function GroupHeader({ group, open, onToggle, onAccept }: ProposalGroupProps) {
  const { total, accepted, pending } = group.counts;
  return (
    <li
      data-slot="proposal-review-group-header"
      className="sticky top-0 z-[1] mt-1 rounded-lg bg-surface ring-1 ring-border"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onToggle(group.key)}
          className="inline-flex min-h-11 min-w-0 flex-[1_1_10rem] items-center gap-1.5 rounded-md py-0.5 text-left text-meta font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-7"
        >
          <Icon
            name="keyboard_arrow_down"
            size={18}
            tone="muted"
            className={cn("shrink-0 motion-safe:transition-transform", !open && "-rotate-90")}
          />
          <span className="min-w-0">{group.label}</span>
        </button>
        {onAccept && pending > 0 ? (
          <Button
            size="xs"
            variant="outline"
            icon="done_all"
            aria-label={`Accepter les ${pending} ${plural(pending, "restante", "restantes")} de ${group.label}`}
            onClick={() => onAccept(group.key)}
            className="h-11 shrink-0 md:h-6"
          >
            {`Accepter les ${pending} ${plural(pending, "restante", "restantes")}`}
          </Button>
        ) : null}
        <span className="basis-full pl-6 text-caption font-normal text-muted-foreground">
          {`${total} · ${accepted} ${plural(accepted, "acceptée", "acceptées")} · ${pending} à relire`}
        </span>
      </div>
    </li>
  );
}

function VirtualBody({ group, selectedId, onSelect }: ProposalGroupProps) {
  return (
    <li>
      <VirtualList<ProposalReviewItem>
        items={group.items}
        total={group.matching}
        label={`Propositions · ${group.label}`}
        getItemKey={(item) => item.id}
        renderItem={(item) => <ProposalRowContent item={item} />}
        selectedKey={selectedId}
        onActivate={(item) => onSelect(item.id)}
        className="h-[416px]"
      />
    </li>
  );
}

function MoreButton({ group, onLoadMore }: ProposalGroupProps) {
  const rest = group.matching - group.items.length;
  if (rest <= 0 || !onLoadMore) return null;
  const next = Math.min(PROPOSAL_NEXT_PAGE, rest);
  return (
    <li>
      <button
        type="button"
        onClick={() => onLoadMore(group.key)}
        className="h-11 w-full rounded-md pl-8 text-left text-caption text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:h-8"
      >
        {`Afficher ${next} de plus · ${rest} ${plural(rest, "restante", "restantes")} dans ce groupe`}
      </button>
    </li>
  );
}

/** Un groupe de la relecture en volume : en-tête, éléments (virtualisés au-delà de 30 chargés), « Afficher N de plus ». */
export function ProposalGroupSection(props: ProposalGroupProps) {
  const { group, open, selectedId, onSelect } = props;
  return (
    <>
      <GroupHeader {...props} />
      {open && group.items.length > VIRTUAL_FROM ? <VirtualBody {...props} /> : null}
      {open && group.items.length <= VIRTUAL_FROM
        ? group.items.map((item, index) => (
            <ProposalRow
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              setSize={group.matching}
              position={index + 1}
              onSelect={onSelect}
            />
          ))
        : null}
      {open ? <MoreButton {...props} /> : null}
    </>
  );
}
