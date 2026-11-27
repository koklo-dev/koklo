"use client";

import type { SecurityRightsMatrix } from "@koklo/contract";
import { type AccessLevel, FactsPanel, IconList, PermissionMatrix, StatCard } from "@koklo/ui";
import {
  ABUSE_TEXT,
  ABUSE_TITLE,
  NO_OWNERSHIP,
  NO_ROLE_TEXT,
  NO_ROLE_TITLE,
  OWNERSHIP_TITLE,
  RIGHTS_INTRO,
} from "../lib/security-labels.ts";
import type { SecurityPageModel } from "../lib/use-security-page.ts";
import { SecurityEmpty, SecurityRead } from "./security-empty.tsx";

type Access = SecurityRightsMatrix["actions"][number]["cells"][number]["access"];
const LEVELS: Record<Access, AccessLevel> = {
  yes: "allowed",
  no: "denied",
  restricted: "restricted",
};

const actionsOf = ({ roles, actions }: SecurityRightsMatrix) =>
  actions.map(({ id, label, cells }) => ({
    id,
    label,
    access: roles.map((role) => {
      const cell = cells.find((item) => item.role === role.id);
      return { level: LEVELS[cell?.access ?? "no"], restriction: cell?.restriction };
    }),
  }));

function Matrix({ rights }: { rights: SecurityRightsMatrix }) {
  if (rights.roles.length === 0) {
    return <SecurityEmpty icon="admin_panel_settings" title={NO_ROLE_TITLE} text={NO_ROLE_TEXT} />;
  }
  return (
    <>
      <PermissionMatrix variant="compact" roles={rights.roles} actions={actionsOf(rights)} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-3">
        <FactsPanel title={OWNERSHIP_TITLE}>
          {rights.ownershipRules.length > 0 ? (
            <IconList variant="rule" items={rights.ownershipRules} />
          ) : (
            <p className="m-0 text-meta text-muted-foreground">{NO_OWNERSHIP}</p>
          )}
        </FactsPanel>
        <StatCard
          density="hero"
          label={ABUSE_TITLE}
          value={String(rights.abuseScenarios)}
          note={ABUSE_TEXT}
        />
      </div>
    </>
  );
}

/** Onglet Droits (maquette 15 l.171-185) : matrice en lecture, règles de propriété et scénarios d'abus. */
export function SecurityRightsTab({ page }: { page: SecurityPageModel }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 px-4 pt-4 pb-7 md:px-7">
      <p className="m-0 max-w-[820px] text-meta text-muted-foreground">{RIGHTS_INTRO}</p>
      <SecurityRead query={page.totals.rights}>
        {(rights) => <Matrix rights={rights as SecurityRightsMatrix} />}
      </SecurityRead>
    </div>
  );
}
