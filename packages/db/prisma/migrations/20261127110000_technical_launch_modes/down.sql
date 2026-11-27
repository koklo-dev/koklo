-- Retour exact à 20261127100000_technical_proposal_kinds : les lancements des deux modes sont retirés (leurs propositions et
-- leurs décisions suivent par cascade), puis le CHECK du mode est restauré sans `compare` ni `nfr`.
DELETE FROM "public"."agent_launches" WHERE "mode" IN ('compare', 'nfr');
ALTER TABLE "public"."agent_launches" DROP CONSTRAINT "agent_launches_mode_check";
ALTER TABLE "public"."agent_launches" ADD CONSTRAINT "agent_launches_mode_check" CHECK ("mode" IN ('complete', 'criteria', 'update', 'all', 'decision', 'document'));
