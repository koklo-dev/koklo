-- TK-55a : liaison client <-> projet (cloisonnement). Additif : une table, sans enum, sans fonction, sans trigger.
-- Que le membre ait le rôle `client` est un invariant d'API (projectClient.add), pas de la base.
-- CreateTable
CREATE TABLE "project_client_access" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_client_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_client_access_organization_id_idx" ON "project_client_access"("organization_id");

-- CreateIndex
CREATE INDEX "project_client_access_organization_id_user_id_idx" ON "project_client_access"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_client_access_project_id_user_id_key" ON "project_client_access"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_client_access_organization_id_id_key" ON "project_client_access"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "project_client_access" ADD CONSTRAINT "project_client_access_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "project_client_access" ADD CONSTRAINT "project_client_access_organization_id_user_id_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "members"("organization_id", "user_id") ON DELETE CASCADE;
