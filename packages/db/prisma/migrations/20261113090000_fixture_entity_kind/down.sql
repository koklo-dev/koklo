-- Retour arrière de TK-107 lot A : les lignes `fixture` sont retirées (l'index se reconstruit depuis la spec), puis le CHECK
-- du genre est restauré sans `fixture`.
DELETE FROM "public"."spec_entities" WHERE "kind" = 'fixture';
ALTER TABLE "public"."spec_entities" DROP CONSTRAINT "spec_entities_kind_check";
ALTER TABLE "public"."spec_entities" ADD CONSTRAINT "spec_entities_kind_check" CHECK ("kind" IN ('feature', 'rule', 'roles', 'flow', 'relations', 'table', 'endpoint', 'screen', 'test'));
