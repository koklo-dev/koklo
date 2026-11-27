-- TK-115 lot A (B732) : commentaires sur un choix technique, sur les environnements et sur une section du cahier. Additif :
-- trois valeurs d'enum de `comment_target_kind` ; la cible se désigne par `target_ref` (`ST-<slug>`, `environments`,
-- `DOC-<slug>`). Aucune ligne modifiée.
ALTER TYPE "comment_target_kind" ADD VALUE 'stack';
ALTER TYPE "comment_target_kind" ADD VALUE 'environments';
ALTER TYPE "comment_target_kind" ADD VALUE 'tech_section';
