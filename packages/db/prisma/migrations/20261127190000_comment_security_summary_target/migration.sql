-- TK-117 lot A (B802) : commentaires sur le résumé client de la Sécurité, seule cible nouvelle. Additif : une valeur
-- d'enum de `comment_target_kind`. Aucune ligne touchée.
ALTER TYPE "comment_target_kind" ADD VALUE 'security_summary';
