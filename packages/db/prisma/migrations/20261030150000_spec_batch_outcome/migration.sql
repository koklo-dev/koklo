-- TK-44a : résultat d'un lot d'écriture de spec (additif, aucune table ajoutée).
-- Rapport de validation (objet JSON), message de commit demandé, rôle de l'auteur au moment de
-- la soumission (contrôle « designer » du worker), compteur des identifiants de feature `F-nnn`.

-- AlterEnum
ALTER TYPE "counter_name" ADD VALUE 'feature';

-- AlterTable
ALTER TABLE "spec_write_batches" ADD COLUMN "report" JSONB,
ADD COLUMN "message" TEXT,
ADD COLUMN "author_role" TEXT;

-- Cohérence du résultat : un lot refusé (`failed`, `conflict`) dit pourquoi, seul un lot validé
-- porte un SHA de commit (la CHECK `committed => commit_sha, committed_at` existe déjà), le
-- rapport est un objet (le JSON `null` est refusé). `position` des opérations : base 1 en base,
-- base 0 au contrat (traduit par le dépôt).
ALTER TABLE "spec_write_batches" ADD CONSTRAINT "spec_write_batches_error_code_check" CHECK (
  "status" NOT IN ('failed', 'conflict') OR "error_code" IS NOT NULL
);
ALTER TABLE "spec_write_batches" ADD CONSTRAINT "spec_write_batches_commit_sha_status_check" CHECK (
  "commit_sha" IS NULL OR "status" = 'committed'
);
ALTER TABLE "spec_write_batches" ADD CONSTRAINT "spec_write_batches_report_object_check" CHECK (
  "report" IS NULL OR jsonb_typeof("report") = 'object'
);
