import type { AiUsage } from "@koklo/domain";

/** Dossier de référence : un énoncé en français, inventé, sans donnée réelle. */
export interface QualificationCase {
  readonly id: string;
  readonly brief: string;
}

const cases = (...briefs: readonly string[]): readonly QualificationCase[] =>
  Object.freeze(briefs.map((brief, index) => Object.freeze({ id: `dossier-${index + 1}`, brief })));

/** Jeu de dossiers par usage : au moins trois, déterministe, jamais de donnée réelle. */
export const QUALIFICATION_CASES: Readonly<Record<AiUsage, readonly QualificationCase[]>> =
  Object.freeze({
    idea_space: cases(
      "Une petite librairie de quartier veut permettre à ses clients de réserver un livre en ligne et de le retirer en boutique sous quarante-huit heures.",
      "Une association sportive souhaite suivre les présences aux entraînements et prévenir les parents quand une séance est annulée.",
      "Un cabinet d'architectes veut centraliser les demandes de modification des plans reçues des clients et en suivre le traitement.",
    ),
    spec_deliverables: cases(
      "Livrer un module de réservation : le client choisit un livre, reçoit une confirmation, et le libraire voit la liste des retraits du jour.",
      "Livrer un tableau de présences : l'entraîneur coche les présents, le système garde l'historique par joueur et par mois.",
      "Livrer un registre des demandes : chaque demande a un auteur, une date, un statut et une réponse de l'équipe.",
    ),
    baseline_summary: cases(
      "Le périmètre comprend trois fonctionnalités et douze tickets. Deux tickets sont terminés, cinq sont en cours et cinq restent à faire avant la livraison prévue.",
      "La version de référence fige la liste des livrables acceptés. Une fonctionnalité a été retirée et une autre ajoutée depuis la dernière validation du client.",
      "Au dernier point, la moitié des tickets critiques est livrée. Un ticket est bloqué par une décision du client, les autres avancent normalement.",
    ),
    ticket_breakdown: cases(
      "Fonctionnalité : permettre au client de réserver un livre. Découper en tickets réalisables en une à deux journées chacun.",
      "Fonctionnalité : envoyer un message aux parents lors d'une annulation de séance. Découper en tickets avec leurs critères d'acceptation.",
      "Fonctionnalité : suivre le statut d'une demande de modification de plan. Découper en tickets indépendants et ordonnés.",
    ),
  });
