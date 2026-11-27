-- Retour exact à 20261127150000_security_entity_kinds : les propositions des cinq types sont retirées (leurs décisions
-- suivent par cascade), puis le CHECK du type est restauré sans eux.
DELETE FROM "public"."agent_proposals" WHERE "kind" IN ('threat', 'sensitive', 'right', 'asvs', 'summary');
ALTER TABLE "public"."agent_proposals" DROP CONSTRAINT "agent_proposals_kind_check";
ALTER TABLE "public"."agent_proposals" ADD CONSTRAINT "agent_proposals_kind_check" CHECK ("kind" IN ('feature', 'criteria', 'rule', 'role', 'flow', 'table', 'relations', 'fixtures', 'component', 'archflow', 'adr', 'doc_section', 'stack', 'op', 'nfr', 'env'));
