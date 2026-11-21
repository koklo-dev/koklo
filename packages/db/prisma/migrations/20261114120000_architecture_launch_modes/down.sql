-- Retour arrière de TK-111 lot B : les lancements des deux modes sont retirés (leurs propositions et leurs décisions suivent par
-- cascade), puis le CHECK du mode est restauré sans `decision` ni `document`.
DELETE FROM "public"."agent_launches" WHERE "mode" IN ('decision', 'document');
ALTER TABLE "public"."agent_launches" DROP CONSTRAINT "agent_launches_mode_check";
ALTER TABLE "public"."agent_launches" ADD CONSTRAINT "agent_launches_mode_check" CHECK ("mode" IN ('complete', 'criteria', 'update', 'all'));
