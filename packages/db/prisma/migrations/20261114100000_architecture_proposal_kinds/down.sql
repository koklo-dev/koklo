-- Retour arrière de TK-111 lot A : les propositions des quatre types sont retirées (leurs décisions suivent par cascade),
-- puis le CHECK du type est restauré sans `component`, `archflow`, `adr`, `doc_section`.
DELETE FROM "public"."agent_proposals" WHERE "kind" IN ('component', 'archflow', 'adr', 'doc_section');
ALTER TABLE "public"."agent_proposals" DROP CONSTRAINT "agent_proposals_kind_check";
ALTER TABLE "public"."agent_proposals" ADD CONSTRAINT "agent_proposals_kind_check" CHECK ("kind" IN ('feature', 'criteria', 'rule', 'role', 'flow', 'table', 'relations', 'fixtures'));
