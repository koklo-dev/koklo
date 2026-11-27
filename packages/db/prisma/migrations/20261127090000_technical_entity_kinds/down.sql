-- Retour exact à 20261124100000_agent_proposal_discard_reason : les lignes `stack`, `nfr`, `environments` sont retirées
-- (l'index se reconstruit depuis la spec), puis le CHECK du genre est restauré sans elles.
DELETE FROM "public"."spec_entities" WHERE "kind" IN ('stack', 'nfr', 'environments');
ALTER TABLE "public"."spec_entities" DROP CONSTRAINT "spec_entities_kind_check";
ALTER TABLE "public"."spec_entities" ADD CONSTRAINT "spec_entities_kind_check" CHECK ("kind" IN ('feature', 'rule', 'roles', 'flow', 'relations', 'table', 'fixture', 'component', 'archflow', 'adr', 'endpoint', 'screen', 'test'));
