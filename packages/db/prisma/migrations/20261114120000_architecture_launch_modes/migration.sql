-- TK-111 lot B : modes de lancement du livrable Architecture (`decision` : proposer une décision, `document` : rédiger le
-- document). Additif : le CHECK du mode est refait en entier avec les deux valeurs en plus ; aucune table, aucune ligne.
ALTER TABLE "agent_launches" DROP CONSTRAINT "agent_launches_mode_check";
ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_mode_check" CHECK ("mode" IN ('complete', 'criteria', 'update', 'all', 'decision', 'document'));
