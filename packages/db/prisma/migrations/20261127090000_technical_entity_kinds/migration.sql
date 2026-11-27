-- TK-115 lot A : nouveaux genres d'entité indexée `stack`, `nfr`, `environments` (`tech/stack/`, `nfr/`,
-- `tech/environments.yaml`). Additif : le CHECK du genre est refait en entier avec les valeurs en plus ; aucune table, aucune ligne.
ALTER TABLE "spec_entities" DROP CONSTRAINT "spec_entities_kind_check";
ALTER TABLE "spec_entities" ADD CONSTRAINT "spec_entities_kind_check" CHECK ("kind" IN ('feature', 'rule', 'roles', 'flow', 'relations', 'table', 'fixture', 'component', 'archflow', 'adr', 'endpoint', 'screen', 'test', 'stack', 'nfr', 'environments'));
