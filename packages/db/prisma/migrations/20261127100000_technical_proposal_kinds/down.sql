-- Retour exact à 20261127090000_technical_entity_kinds : les propositions des quatre types sont retirées (leurs décisions
-- suivent par cascade), puis le CHECK du type est restauré sans `stack`, `op`, `nfr`, `env`.
DELETE FROM "public"."agent_proposals" WHERE "kind" IN ('stack', 'op', 'nfr', 'env');
ALTER TABLE "public"."agent_proposals" DROP CONSTRAINT "agent_proposals_kind_check";
ALTER TABLE "public"."agent_proposals" ADD CONSTRAINT "agent_proposals_kind_check" CHECK ("kind" IN ('feature', 'criteria', 'rule', 'role', 'flow', 'table', 'relations', 'fixtures', 'component', 'archflow', 'adr', 'doc_section'));
