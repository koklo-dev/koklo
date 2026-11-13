-- TK-107 lot B (B387) : types de proposition du livrable Données (`table`, `relations`, `fixtures`). Additif : le CHECK du type
-- est refait en entier avec les trois valeurs en plus ; aucune table, aucune ligne.
ALTER TABLE "agent_proposals" DROP CONSTRAINT "agent_proposals_kind_check";
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_kind_check" CHECK ("kind" IN ('feature', 'criteria', 'rule', 'role', 'flow', 'table', 'relations', 'fixtures'));
