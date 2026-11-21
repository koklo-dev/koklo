-- Retour arrière de TK-111 lot A : les lignes `component`, `archflow`, `adr` sont retirées (l'index se reconstruit depuis la
-- spec), puis le CHECK du genre est restauré sans elles.
DELETE FROM "public"."spec_entities" WHERE "kind" IN ('component', 'archflow', 'adr');
ALTER TABLE "public"."spec_entities" DROP CONSTRAINT "spec_entities_kind_check";
ALTER TABLE "public"."spec_entities" ADD CONSTRAINT "spec_entities_kind_check" CHECK ("kind" IN ('feature', 'rule', 'roles', 'flow', 'relations', 'table', 'fixture', 'endpoint', 'screen', 'test'));
