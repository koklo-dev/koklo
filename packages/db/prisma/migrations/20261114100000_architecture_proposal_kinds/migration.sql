-- TK-111 lot A : types de proposition du livrable Architecture (`component`, `archflow`, `adr`, `doc_section`). Additif : le
-- CHECK du type est refait en entier avec les quatre valeurs en plus ; aucune table, aucune ligne.
ALTER TABLE "agent_proposals" DROP CONSTRAINT "agent_proposals_kind_check";
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_kind_check" CHECK ("kind" IN ('feature', 'criteria', 'rule', 'role', 'flow', 'table', 'relations', 'fixtures', 'component', 'archflow', 'adr', 'doc_section'));
