-- TK-117 lot A (B801) : contact en cas d'incident d'un projet, écrit par le client lié ; jamais dans Git ni envoyé à
-- l'agent. Additif : une table, une ligne par projet. `updated_by` sans clé étrangère (RGPD). Les bornes de longueur
-- sont des CHECK écrits à la main (Prisma ne les modélise pas).

-- CreateTable
CREATE TABLE "project_incident_contacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_incident_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_incident_contacts_name_check" CHECK (char_length("name") BETWEEN 1 AND 120),
    CONSTRAINT "project_incident_contacts_phone_check" CHECK (char_length("phone") BETWEEN 1 AND 40)
);

-- CreateIndex
CREATE UNIQUE INDEX "project_incident_contacts_organization_id_id_key" ON "project_incident_contacts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_incident_contacts_project_id_key" ON "project_incident_contacts"("project_id");

-- CreateIndex
CREATE INDEX "project_incident_contacts_organization_id_project_id_idx" ON "project_incident_contacts"("organization_id", "project_id");

-- AddForeignKey
ALTER TABLE "project_incident_contacts" ADD CONSTRAINT "project_incident_contacts_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
