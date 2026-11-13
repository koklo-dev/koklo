-- TK-107 lot A (B383) : nouveau genre d'entité indexée `fixture` (jeux d'exemple `data/fixtures/FX-<slug>.yaml`). Additif :
-- le CHECK du genre est refait en entier avec la valeur en plus ; aucune table, aucune ligne.
ALTER TABLE "spec_entities" DROP CONSTRAINT "spec_entities_kind_check";
ALTER TABLE "spec_entities" ADD CONSTRAINT "spec_entities_kind_check" CHECK ("kind" IN ('feature', 'rule', 'roles', 'flow', 'relations', 'table', 'fixture', 'endpoint', 'screen', 'test'));
