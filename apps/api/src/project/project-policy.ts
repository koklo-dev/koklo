export const PROJECT_POLICY = Symbol("PROJECT_POLICY");

/**
 * Politique de données d'un projet (TK-93, B304). Lue par le moteur d'IA avant chaque appel : un
 * projet « données en UE » n'atteint jamais un fournisseur hors UE (OpenRouter), ni en principal ni
 * en secours. Un projet inconnu est traité comme « en UE » : en cas de doute, la lecture prudente.
 */
export interface ProjectPolicyStore {
  euOnly(organizationId: string, projectId: string): Promise<boolean>;
}
