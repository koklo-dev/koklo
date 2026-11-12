import { DELIVERABLE_KEYS } from "@koklo/contract";
import type { DeliverableStatus } from "@koklo/domain";
import { type ReviewVerdict, validationOf } from "../client-space/validation.ts";
import { specLink } from "./overview-links.ts";
import { plural } from "./overview-texts.ts";

type Key = (typeof DELIVERABLE_KEYS)[number];

/** Ce que les reviews disent du Fonctionnel, seul livrable validable avant TK-100 (B273). */
export interface FunctionalState {
  status: DeliverableStatus;
  total: number;
  done: number;
  /** Fonctionnalités sans verdict valable sur la version courante (jamais jugées, ou jugées avant un changement). */
  pending: number;
  revise: number;
}

/**
 * `verdicts` : dernière review de chaque fonctionnalité de la version courante (`headSha`). « À revoir » prime
 * sur « À valider », qui prime sur « Validé » ; sans fonctionnalité, le livrable est « À faire ».
 */
export function functionalStateOf(
  verdicts: readonly (ReviewVerdict | undefined)[],
  headSha: string | null,
): FunctionalState {
  const states = headSha === null ? [] : verdicts.map((verdict) => validationOf(verdict, headSha));
  const count = (validation: string) => states.filter((s) => s.validation === validation).length;
  const [done, revise, pending] = [count("validated"), count("to_revise"), count("to_validate")];
  const total = states.length;
  const status = revise > 0 ? "revise" : pending > 0 ? "pending" : total > 0 ? "validated" : "todo";
  return { status, total, done, pending, revise };
}

export interface DeliverableCard {
  key: Key;
  status: DeliverableStatus;
  content: string;
  done?: number;
  total?: number;
  progressLabel: string;
  validator: "client" | "team";
  validatorLabel: string;
  available: boolean;
  href?: string;
}

/** Livrables que le client valide obligatoirement (D1). */
const CLIENT_VALIDATED: readonly Key[] = ["functional", "design"];

function validatorOf(
  key: Key,
  hasClient: boolean,
): Pick<DeliverableCard, "validator" | "validatorLabel"> {
  const byClient = CLIENT_VALIDATED.includes(key);
  if (hasClient && byClient) {
    return { validator: "client", validatorLabel: "Validation client · obligatoire" };
  }
  if (byClient) return { validator: "team", validatorLabel: "Validation par l'équipe" };
  return {
    validator: "team",
    validatorLabel: hasClient
      ? "Validation de l'équipe · le client lit et commente"
      : "Validation de l'équipe",
  };
}

function functionalCard(state: FunctionalState): Partial<DeliverableCard> {
  if (state.total === 0) {
    return {
      status: "todo",
      content: "Aucune fonctionnalité",
      progressLabel: "Aucune fonctionnalité à valider",
    };
  }
  const validated = plural(state.done, "fonctionnalité validée", "fonctionnalités validées");
  return {
    status: state.status,
    content: `${state.total} ${plural(state.total, "fonctionnalité", "fonctionnalités")}`,
    done: state.done,
    total: state.total,
    progressLabel: `${state.done} ${validated} sur ${state.total}`,
  };
}

/** Les sept cartes ; seul le Fonctionnel est ouvrable, les six autres sont « Bientôt disponible » (B273). */
export function deliverableCards(
  projectId: string,
  functional: FunctionalState,
  hasClient: boolean,
  audience: "team" | "client" = "team",
): DeliverableCard[] {
  return DELIVERABLE_KEYS.map((key) => {
    const validator = validatorOf(key, hasClient);
    if (key !== "functional") {
      return {
        key,
        status: "todo",
        content: "Bientôt disponible",
        progressLabel: "À faire",
        available: false,
        ...validator,
      };
    }
    return {
      key,
      status: "todo",
      content: "",
      progressLabel: "",
      ...functionalCard(functional),
      available: true,
      ...(audience === "team" ? { href: specLink(projectId) } : {}),
      ...validator,
    };
  });
}
