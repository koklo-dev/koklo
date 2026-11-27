-- TK-117 lot A (B806) : modes de lancement de la Sécurité (`threats`, `classify`, `asvs`, `summary`). Additif : le
-- CHECK du mode est refait en entier avec les quatre valeurs en plus ; aucune ligne.
ALTER TABLE "agent_launches" DROP CONSTRAINT "agent_launches_mode_check";
ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_mode_check" CHECK ("mode" IN ('complete', 'criteria', 'update', 'all', 'decision', 'document', 'compare', 'nfr', 'threats', 'classify', 'asvs', 'summary'));
