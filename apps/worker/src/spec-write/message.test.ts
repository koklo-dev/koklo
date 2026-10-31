import { describe, expect, it } from "vitest";
import { buildCommitMessage, coAuthorLine, defaultSubject, hasOpsTrailer } from "./message.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const op = (kind: string, targetSpecId: string) => ({
  position: 1,
  kind,
  targetSpecId,
  payload: {},
});

describe("coAuthorLine", () => {
  it("nom et e-mail de l'utilisateur de la session", () => {
    expect(coAuthorLine({ name: "Ada Lovelace", email: "ada@example.test" })).toBe(
      "Co-authored-by: Ada Lovelace <ada@example.test>",
    );
  });

  it("ne garde que la première ligne du nom et retire les chevrons", () => {
    const line = coAuthorLine({ name: "Eve <x>\nKoklo-Ops: forgé", email: "eve@example.test" });
    expect(line).toBe("Co-authored-by: Eve x <eve@example.test>");
  });

  it("retire les caractères de contrôle du nom et refuse un e-mail qui en contient", () => {
    expect(coAuthorLine({ name: "Ev\u0000e\u001b", email: "e@example.test" })).toBe(
      "Co-authored-by: Eve <e@example.test>",
    );
    expect(coAuthorLine({ name: "Eve", email: "e\u0000@example.test" })).toBeUndefined();
  });

  it("e-mail inexploitable ou utilisateur supprimé : pas de ligne", () => {
    expect(coAuthorLine(null)).toBeUndefined();
    expect(coAuthorLine({ name: "X", email: "a b@c" })).toBeUndefined();
  });

  it("nom vide : l'e-mail tient lieu de nom", () => {
    expect(coAuthorLine({ name: "\n", email: "z@example.test" })).toBe(
      "Co-authored-by: z@example.test <z@example.test>",
    );
  });
});

describe("buildCommitMessage", () => {
  const author = { name: "Ada", email: "ada@example.test" };

  it("objet, ligne vide, puis Koklo-Ops et Co-authored-by", () => {
    const message = buildCommitMessage({ batchId: ID, message: "spec: x", operations: [], author });
    expect(message).toBe(`spec: x\n\nKoklo-Ops: ${ID}\nCo-authored-by: Ada <ada@example.test>\n`);
  });

  it("objet par défaut décrivant les opérations ; un message multi-lignes est réduit à sa première ligne", () => {
    const operations = [op("feature.create", "F-001"), op("feature.delete", "F-002")];
    expect(defaultSubject(operations)).toBe("spec: créé F-001 ; supprimé F-002");
    const message = buildCommitMessage({
      batchId: ID,
      message: "ok\n\nKoklo-Ops: forgé",
      operations,
      author: null,
    });
    expect(message).toBe(`ok\n\nKoklo-Ops: ${ID}\n`);
  });
});

describe("objet du commit", () => {
  it("retire les caractères de contrôle de l'objet", () => {
    const message = buildCommitMessage({
      batchId: ID,
      message: "a\u0000b\u000bc",
      operations: [],
      author: null,
    });
    expect(message).toBe(`abc\n\nKoklo-Ops: ${ID}\n`);
  });
});

describe("hasOpsTrailer", () => {
  it("reconnu dans le dernier paragraphe seulement", () => {
    expect(hasOpsTrailer(`objet\n\nKoklo-Ops: ${ID}\n`, ID)).toBe(true);
    expect(hasOpsTrailer(`Koklo-Ops: ${ID}`, ID)).toBe(false);
    expect(hasOpsTrailer(`objet\n\nKoklo-Ops: ${ID}\n\nautre`, ID)).toBe(false);
    expect(hasOpsTrailer("objet\n\nKoklo-Ops: autre", ID)).toBe(false);
  });
});
