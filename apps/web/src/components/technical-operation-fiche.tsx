"use client";

import type { TechnicalContract } from "@koklo/contract";
import {
  Button,
  EntityChip,
  Icon,
  InlineAlert,
  OperationFicheTitle,
  OperationFieldsTable,
  OperationKindPill,
  Pill,
  SegmentedControl,
  Skeleton,
} from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { orpc } from "../lib/orpc.ts";
import {
  CONTRACT_NOTE,
  callersOf,
  noContractText,
  permissionIdOf,
  YAML_SOURCE_NOTE,
} from "../lib/technical-api-labels.ts";
import type { OperationFicheData } from "../lib/use-technical-api.ts";
import { SourceBlock } from "./data-diagram-source.tsx";
import { GitReadError } from "./git-read-error.tsx";
import { TechnicalYaml } from "./technical-source.tsx";

type View = "fiche" | "yaml" | "contract";
const VIEWS = [
  { value: "fiche", label: "Fiche" },
  { value: "yaml", label: "YAML" },
  { value: "contract", label: "Contrat généré" },
] as const;

const LABEL = "text-caption font-semibold uppercase tracking-[0.05em] text-muted-foreground";

export interface OperationFicheProps {
  projectId: string;
  operation: OperationFicheData;
  /** Vue client : la fiche seule, sans YAML, contrat ni écriture. */
  client?: boolean;
  /** « Modifier » (équipe qui écrit). */
  onEdit?: (() => void) | undefined;
  /** « Commenter » (client seulement). */
  onComment?: (() => void) | undefined;
}

const orDash = (value: string | undefined): string => value ?? "—";

function Tables({ operation }: { operation: OperationFicheData }) {
  const { input, output, errors } = operation;
  const tables = [
    {
      title: "Entrée",
      columns: ["Champ", "Type", "Contrainte"] as const,
      rows: input.map((row) => [row.field, row.type, row.constraint ?? ""] as const),
    },
    {
      title: "Sortie",
      columns: ["Champ", "Type", "Note"] as const,
      rows: output.map((row) => [row.field, row.type, row.note ?? ""] as const),
    },
    {
      title: "Erreurs",
      columns: ["Code", "Règle", "Quand"] as const,
      rows: errors.map((row) => [row.code, orDash(row.rule), row.when] as const),
    },
  ];
  return (
    <>
      {tables
        .filter((table) => table.rows.length > 0)
        .map((table) => (
          <OperationFieldsTable key={table.title} {...table} />
        ))}
    </>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** Appelants : la permission sur la première pastille, les autres rôles par leur nom seul (maquette 14 l.606). */
function Callers({ operation }: { operation: OperationFicheData }) {
  return (
    <Group label="Qui peut appeler">
      {callersOf(operation).map((caller, index) => (
        <EntityChip
          key={caller}
          kind="permission"
          id={index === 0 ? permissionIdOf(operation.permission) : ""}
          title={caller}
        />
      ))}
    </Group>
  );
}

function Groups({ operation }: { operation: OperationFicheData }) {
  const { rules, features, rateLimit } = operation;
  return (
    <>
      <Callers operation={operation} />
      {rules.length > 0 ? (
        <Group label="Règles appliquées">
          {rules.map((id) => (
            <EntityChip key={id} kind="rule" icon="rule" id={id} />
          ))}
        </Group>
      ) : null}
      {features.length > 0 ? (
        <Group label="Fonctionnalités">
          {features.map((id) => (
            <EntityChip key={id} kind="feature" id={id} />
          ))}
        </Group>
      ) : null}
      {rateLimit ? (
        <Group label="Limite de débit">
          <EntityChip kind="limit" id="limite" title={rateLimit} />
        </Group>
      ) : null}
    </>
  );
}

interface ViewProps {
  projectId: string;
  opId: string;
}

/** Vue YAML : `api/endpoints/<zone.verbe>.yaml`. */
function OperationYaml({ projectId, opId }: ViewProps) {
  const source = useQuery(
    orpc.spec.technical.ops.source.queryOptions({ input: { projectId, opId } }),
  );
  return (
    <TechnicalYaml
      query={source}
      label="YAML de l'opération"
      note={YAML_SOURCE_NOTE}
      fallback="Le fichier de l'opération n'a pas pu être lu."
    />
  );
}

function ContractCode({ contract }: { contract: TechnicalContract }) {
  if (!contract.available) {
    return (
      <InlineAlert variant="neutral" icon="code">
        {noContractText(contract)}
      </InlineAlert>
    );
  }
  return (
    <SourceBlock
      icon="code"
      path={contract.path}
      label="Contrat généré"
      code={contract.code}
      note={CONTRACT_NOTE}
      maxHeight={620}
      tag={<Pill size="md" tone="soft">{`Généré · ${contract.generator.label}`}</Pill>}
    />
  );
}

/** Contrat généré à la lecture par le générateur de la stack retenue (B770) : rien n'est écrit. */
function OperationContract({ projectId, opId }: ViewProps) {
  const query = useQuery(orpc.spec.technical.contract.queryOptions({ input: { projectId, opId } }));
  if (query.isPending) return <Skeleton aria-busy="true" className="h-40 rounded-[10px]" />;
  if (query.isError || !query.data) {
    return (
      <GitReadError
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        fallback="Le contrat n'a pas pu être généré."
      />
    );
  }
  return <ContractCode contract={query.data} />;
}

interface HeaderProps extends OperationFicheProps {
  view: View;
  onView: (view: View) => void;
}

function Header({ operation, client, onEdit, onComment, view, onView }: HeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <OperationKindPill type={operation.type} />
      <span className="text-caption font-normal text-muted-foreground">
        {`${operation.zone} · ${operation.component}`}
      </span>
      <span className="flex-1" />
      {onEdit ? (
        <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={onEdit}>
          Modifier
        </Button>
      ) : null}
      {onComment ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-11"
          onClick={onComment}
        >
          <Icon name="add_comment" size={16} />
          Commenter
        </Button>
      ) : null}
      {client ? null : (
        <SegmentedControl<View>
          aria-label="Affichage de l'opération"
          options={VIEWS}
          value={view}
          onValueChange={onView}
        />
      )}
    </div>
  );
}

/**
 * Fiche d'une opération (maquette 14 l.236-258) : type, zone et composant, nom, résumé, puis « Fiche · YAML · Contrat
 * généré » ; le client lit la fiche seule.
 */
export function OperationFiche(props: OperationFicheProps) {
  const { projectId, operation, client = false } = props;
  const [view, setView] = useState<View>("fiche");
  const shown = client ? "fiche" : view;
  const ids = { projectId, opId: operation.specId };
  return (
    <article aria-label="Opération" className="flex min-w-0 flex-col gap-3.5">
      <Header {...props} view={view} onView={setView} />
      <OperationFicheTitle>{operation.specId}</OperationFicheTitle>
      <p className="m-0 break-words text-body leading-[1.55]">{operation.summary}</p>
      {shown === "fiche" ? (
        <>
          <Tables operation={operation} />
          <Groups operation={operation} />
        </>
      ) : null}
      {shown === "yaml" ? <OperationYaml {...ids} /> : null}
      {shown === "contract" ? <OperationContract {...ids} /> : null}
    </article>
  );
}
