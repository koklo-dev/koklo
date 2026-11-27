-- Retour exact à 20261127160000_security_proposal_kinds : les lancements des quatre modes sont retirés (leurs
-- propositions et leurs décisions suivent par cascade), puis le CHECK du mode est restauré sans eux.
DELETE FROM "public"."agent_launches" WHERE "mode" IN ('threats', 'classify', 'asvs', 'summary');
ALTER TABLE "public"."agent_launches" DROP CONSTRAINT "agent_launches_mode_check";
ALTER TABLE "public"."agent_launches" ADD CONSTRAINT "agent_launches_mode_check" CHECK ("mode" IN ('complete', 'criteria', 'update', 'all', 'decision', 'document', 'compare', 'nfr'));
