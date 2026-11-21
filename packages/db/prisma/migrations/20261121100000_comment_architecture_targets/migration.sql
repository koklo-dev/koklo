-- TK-113 lot A : commentaires sur les composants, décisions et flux de l'architecture (B575 à B592). Additif : trois nouvelles
-- valeurs d'enum de `comment_target_kind` ; la cible se désigne par `target_ref` (`C-<slug>`, `ADR-<nnn>`, `P-<slug>`). Aucune ligne modifiée.
ALTER TYPE "comment_target_kind" ADD VALUE 'component';
ALTER TYPE "comment_target_kind" ADD VALUE 'adr';
ALTER TYPE "comment_target_kind" ADD VALUE 'archflow';
