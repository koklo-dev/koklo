-- TK-100 (B325 f) : forçage de l'ouverture d'un livrable de la spec par un owner ou un admin (`spec.forceDeliverable`).
-- Additif : une table, sans enum, fonction ni trigger. Le forçage ouvre le livrable sans rien valider ; une ligne par
-- projet et livrable (clé unique), jamais modifiée. `forced_by` sans clé étrangère (RGPD, comme les décisions
-- d'agent). La liste fermée des sept livrables est un CHECK écrit à la main (Prisma ne le modélise pas).

-- CreateTable
CREATE TABLE "deliverable_overrides" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "deliverable" TEXT NOT NULL,
    "forced_by" UUID NOT NULL,
    "forced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverable_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "deliverable_overrides_deliverable_check" CHECK ("deliverable" IN ('functional', 'data', 'architecture', 'technical', 'security', 'design', 'quality'))
);

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_overrides_organization_id_id_key" ON "deliverable_overrides"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_overrides_project_id_deliverable_key" ON "deliverable_overrides"("project_id", "deliverable");

-- CreateIndex
CREATE INDEX "deliverable_overrides_organization_id_project_id_idx" ON "deliverable_overrides"("organization_id", "project_id");

-- AddForeignKey
ALTER TABLE "deliverable_overrides" ADD CONSTRAINT "deliverable_overrides_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
