-- Retour arrière de TK-107 lot B : les propositions des trois types sont retirées (leurs décisions suivent par cascade),
-- puis le CHECK du type est restauré sans `table`, `relations`, `fixtures`.
DELETE FROM "public"."agent_proposals" WHERE "kind" IN ('table', 'relations', 'fixtures');
ALTER TABLE "public"."agent_proposals" DROP CONSTRAINT "agent_proposals_kind_check";
ALTER TABLE "public"."agent_proposals" ADD CONSTRAINT "agent_proposals_kind_check" CHECK ("kind" IN ('feature', 'criteria', 'rule', 'role', 'flow'));
