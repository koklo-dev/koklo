import type { Role } from "@koklo/contract";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@koklo/ui";
import { formatShortDate, MEMBERS_COPY } from "../lib/members-labels.ts";
import { canTouchMember, ROLE_LABELS } from "../lib/roles.ts";
import { MemberActions, type MemberRow } from "./member-actions.tsx";

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

interface MembersTableProps {
  rows: MemberRow[];
  actorRole: Role | undefined;
  manage: boolean;
  selfId: string | undefined;
  onRole: (member: MemberRow, role: string) => void;
  onRemove: (member: MemberRow) => void;
}

function Identity({ member }: { member: MemberRow }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar aria-hidden="true">
        <AvatarFallback>{initialsOf(member.name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{member.name}</span>
        <span className="break-all text-meta text-muted-foreground">{member.email}</span>
      </div>
    </div>
  );
}

/** Sous 768 px chaque ligne s'empile (nom, menu, puis rôle, projets et activité) : aucun défilement horizontal. */
const ROW = "max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-2 max-md:p-3";
const STACKED = "max-md:col-span-2 max-md:px-0 max-md:py-1";

function Label({ children }: { children: string }) {
  return <span className="text-meta text-muted-foreground md:hidden">{children}</span>;
}

function Projects({ member }: { member: MemberRow }) {
  if (member.projects.length === 0) return <span aria-hidden="true">—</span>;
  return <>{member.projects.map((project) => project.name).join(", ")}</>;
}

function Activity({ member }: { member: MemberRow }) {
  return (
    <>{member.lastActiveAt ? formatShortDate(member.lastActiveAt) : MEMBERS_COPY.neverActive}</>
  );
}

function MemberMenu({
  member,
  actorRole,
  selfId,
  onRole,
  onRemove,
}: Omit<MembersTableProps, "rows" | "manage"> & { member: MemberRow }) {
  if (!selfId || member.userId === selfId || !canTouchMember(actorRole, member.role)) return null;
  return (
    <MemberActions member={member} actorRole={actorRole} onRole={onRole} onRemove={onRemove} />
  );
}

type RowProps = Omit<MembersTableProps, "rows"> & { member: MemberRow };

function MemberTableRow({ member, manage, ...menu }: RowProps) {
  return (
    <TableRow className={ROW}>
      <TableCell className="max-md:col-start-1 max-md:row-start-1 max-md:px-0 max-md:py-1">
        <Identity member={member} />
      </TableCell>
      <TableCell className={STACKED}>
        <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
      </TableCell>
      <TableCell className={STACKED}>
        <Label>Projets : </Label>
        <Projects member={member} />
      </TableCell>
      <TableCell className={STACKED}>
        <Label>Dernière activité : </Label>
        <Activity member={member} />
      </TableCell>
      {manage ? (
        <TableCell className="text-right max-md:col-start-2 max-md:row-start-1 max-md:px-0 max-md:py-1">
          <MemberMenu member={member} {...menu} />
        </TableCell>
      ) : null}
    </TableRow>
  );
}

/** Tableau des membres : en-tête masqué sous 768 px, où les lignes s'empilent. */
export function MembersTable({ rows, manage, ...menu }: MembersTableProps) {
  return (
    <Table>
      <TableCaption className="sr-only">Liste des membres</TableCaption>
      <TableHeader className="max-md:sr-only">
        <TableRow>
          <TableHead>Membre</TableHead>
          <TableHead>Rôle</TableHead>
          <TableHead>Projets</TableHead>
          <TableHead>Dernière activité</TableHead>
          {manage ? <TableHead className="w-12 text-right">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((member) => (
          <MemberTableRow key={member.id} member={member} manage={manage} {...menu} />
        ))}
      </TableBody>
    </Table>
  );
}
