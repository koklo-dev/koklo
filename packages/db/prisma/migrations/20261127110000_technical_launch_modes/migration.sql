-- TK-115 lot A : modes de lancement du livrable Technique (`compare` : comparer les options d'un choix, `nfr` : rendre les
-- exigences mesurables). Additif : le CHECK du mode est refait en entier avec les deux valeurs en plus ; aucune ligne.
ALTER TABLE "agent_launches" DROP CONSTRAINT "agent_launches_mode_check";
ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_mode_check" CHECK ("mode" IN ('complete', 'criteria', 'update', 'all', 'decision', 'document', 'compare', 'nfr'));
