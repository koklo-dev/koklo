import { describe, expect, it } from "vitest";
import { tableDetail } from "./data-values.ts";

/** TK-109 : la fiche d'une table rend `clientSummary` (lu de `resume_client`) pour le formulaire « Ce qu'on enregistre ». */
const where = { filePath: "data/tables/client.yaml", commitSha: "a".repeat(40) };

describe("tableDetail : clientSummary", () => {
  it("rend les phrases du résumé client, dans l'ordre, sans valeur étrangère", () => {
    const detail = tableDetail(
      "T-client",
      { nom: "Client", resume_client: ["Le nom", 3, "", "L'e-mail"], champs: [] },
      where,
    );
    expect(detail.clientSummary).toEqual(["Le nom", "L'e-mail"]);
  });

  it("sans résumé : la clé est absente (la fiche existante ne change pas)", () => {
    expect(tableDetail("T-client", { nom: "Client" }, where)).not.toHaveProperty("clientSummary");
    expect(tableDetail("T-client", { resume_client: [] }, where)).not.toHaveProperty(
      "clientSummary",
    );
  });
});
