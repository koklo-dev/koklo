-- TK-117 lot A : genres d'entité indexée de la Sécurité : `threat` (une ligne par menace), `sensitive` (une ligne par
-- entrée de `security/data.yaml`), `rights`, `asvs` et `security_summary`. Additif : le CHECK du genre est refait en
-- entier avec les valeurs en plus ; aucune table, aucune ligne.
ALTER TABLE "spec_entities" DROP CONSTRAINT "spec_entities_kind_check";
ALTER TABLE "spec_entities" ADD CONSTRAINT "spec_entities_kind_check" CHECK ("kind" IN ('feature', 'rule', 'roles', 'flow', 'relations', 'table', 'fixture', 'component', 'archflow', 'adr', 'endpoint', 'screen', 'test', 'stack', 'nfr', 'environments', 'threat', 'sensitive', 'rights', 'asvs', 'security_summary'));
