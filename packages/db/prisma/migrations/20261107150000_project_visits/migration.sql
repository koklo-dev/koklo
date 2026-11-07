-- TK-88 (B80) : dernier projet ouvert par un membre. Additif : une table, sans enum, sans fonction, sans trigger,
-- sans colonne générée. Préférence personnelle : elle n'accorde aucun droit, l'accès au projet est revérifié à la lecture.
-- CreateTable
CREATE TABLE "project_visits" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "visited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_visits_organization_id_user_id_visited_at_idx" ON "project_visits"("organization_id", "user_id", "visited_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "project_visits_project_id_user_id_key" ON "project_visits"("project_id", "user_id");

-- AddForeignKey
ALTER TABLE "project_visits" ADD CONSTRAINT "project_visits_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_visits" ADD CONSTRAINT "project_visits_organization_id_user_id_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "members"("organization_id", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;
