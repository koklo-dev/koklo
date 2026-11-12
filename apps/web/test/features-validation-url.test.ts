import { describe, expect, it } from "vitest";
import { readFeaturesUrl, withFeaturesUrl } from "../src/lib/features-url.ts";

/** TK-102 lot B : filtre Validation dans l'adresse (maquette 10 l.182-185). */
describe("filtre Validation de l'adresse", () => {
  it.each(["validated", "to_validate", "to_revise"])("accepte %s", (validation) => {
    expect(readFeaturesUrl(`?validation=${validation}`)).toEqual({ validation });
  });

  it.each(["?validation=ok", "?validation=", "?validation=VALIDATED"])(
    "ignore la valeur inconnue (%s)",
    (search) => {
      expect(readFeaturesUrl(search).validation).toBeUndefined();
    },
  );

  it("écrit puis efface le paramètre en conservant le reste", () => {
    const next = withFeaturesUrl("?status=adoptee", { validation: "to_validate" });
    expect(Object.fromEntries(new URLSearchParams(next))).toEqual({
      status: "adoptee",
      validation: "to_validate",
    });
    expect(withFeaturesUrl(next, { validation: null })).toBe("?status=adoptee");
  });
});
