-- TK-116 lot A (B777) : commentaires sur une opération et sur le bloc des exigences. Additif : deux valeurs d'enum de
-- `comment_target_kind` ; la cible se désigne par `target_ref` (nom `zone.verbe`, `requirements`). Aucune ligne touchée.
ALTER TYPE "comment_target_kind" ADD VALUE 'operation';
ALTER TYPE "comment_target_kind" ADD VALUE 'requirements';
