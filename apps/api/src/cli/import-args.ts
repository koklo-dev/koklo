import { parseArgs } from "node:util";
import { SprintImportUsageError } from "../sprint-import/import-errors.ts";

export interface ImportArgs {
  directory: string;
  organizationId: string;
  projectId: string;
  actorId: string;
  startsOn: string;
  endsOn: string;
  dryRun: boolean;
  json: boolean;
}

export const USAGE =
  "usage : import-sprints <répertoire> --organization <uuid> --project <uuid> --actor <uuid> " +
  "[--starts-on AAAA-MM-JJ] [--ends-on AAAA-MM-JJ] [--dry-run] [--json]";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const usage = (message: string): never => {
  throw new SprintImportUsageError(`${message}\n${USAGE}`);
};

function uuidOption(name: string, value: string | undefined): string {
  if (value === undefined) return usage(`--${name} est obligatoire`);
  return UUID.test(value) ? value : usage(`--${name} doit être un UUID`);
}

function dayOption(name: string, value: string): string {
  const match = DAY.exec(value);
  const date = match ? new Date(`${value}T00:00:00.000Z`) : null;
  const real = date && !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  return real ? value : usage(`--${name} doit être une date AAAA-MM-JJ valide`);
}

function parseValues(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        organization: { type: "string" },
        project: { type: "string" },
        actor: { type: "string" },
        "starts-on": { type: "string" },
        "ends-on": { type: "string" },
        "dry-run": { type: "boolean" },
        json: { type: "boolean" },
      },
    });
  } catch (error) {
    return usage(error instanceof Error ? error.message : "arguments invalides");
  }
}

/** Arguments de la commande (`node:util.parseArgs`, aucune dépendance) ; tout écart est un usage invalide. */
export function parseImportArgs(argv: readonly string[], today: () => string): ImportArgs {
  const { values, positionals } = parseValues(argv);
  const [directory, ...extra] = positionals;
  if (directory === undefined || extra.length > 0) usage("un seul répertoire est attendu");
  const startsOn = dayOption("starts-on", values["starts-on"] ?? today());
  const endsOn = dayOption("ends-on", values["ends-on"] ?? startsOn);
  if (endsOn < startsOn) usage("--ends-on ne peut précéder --starts-on");
  return {
    directory: directory ?? "",
    organizationId: uuidOption("organization", values.organization),
    projectId: uuidOption("project", values.project),
    actorId: uuidOption("actor", values.actor),
    startsOn,
    endsOn,
    dryRun: values["dry-run"] === true,
    json: values.json === true,
  };
}
