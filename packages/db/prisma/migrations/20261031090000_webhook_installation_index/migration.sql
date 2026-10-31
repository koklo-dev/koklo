-- TK-45a : index de recherche des livraisons d'une installation (effacement à la suppression de
-- l'installation, rattachement des livraisons). Additif : un index, aucune table.
CREATE INDEX "webhook_deliveries_installation_external_id_idx" ON "webhook_deliveries"("installation_external_id");
