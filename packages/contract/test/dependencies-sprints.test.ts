import { describe, expect, it } from "vitest";
import * as schemas from "../src/schemas.ts";
import {
  BAD_SPRINT_KEYS,
  BAD_TICKET_KEYS,
  input,
  isValid,
  output,
  proc,
  sprint,
} from "./support.ts";

const edge = { key: "TK-2", dependsOn: "TK-1", type: "blocks" };
const dependency = { ticket: "TK-2", dependsOn: "TK-1", type: "blocks" };

describe("D0 groupes dependency et sprint : présence", () => {
  it.each(["add", "remove", "list"])("dependency.%s existe", (name) => {
    expect(proc(`dependency.${name}`)).toBeDefined();
  });
  it.each(["create", "get", "list", "update", "activate", "close"])("sprint.%s existe", (name) => {
    expect(proc(`sprint.${name}`)).toBeDefined();
  });
});

describe("D1 dependency.add : entrée", () => {
  const i = () => input("dependency.add");
  it("accepte blocks et related", async () => {
    expect(await isValid(i(), edge)).toBe(true);
    expect(await isValid(i(), { ...edge, type: "related" })).toBe(true);
  });
  it("rejette l'auto-dépendance", async () => {
    expect(await isValid(i(), { key: "TK-1", dependsOn: "TK-1", type: "blocks" })).toBe(false);
    expect(await isValid(i(), { key: "TK-1", dependsOn: "TK-1", type: "related" })).toBe(false);
  });
  it("rejette type inconnu ou absent, clés mal formées", async () => {
    expect(await isValid(i(), { ...edge, type: "parent" })).toBe(false);
    expect(await isValid(i(), { key: "TK-2", dependsOn: "TK-1" })).toBe(false);
    for (const bad of BAD_TICKET_KEYS) {
      expect(await isValid(i(), { ...edge, key: bad }), bad).toBe(false);
      expect(await isValid(i(), { ...edge, dependsOn: bad }), bad).toBe(false);
    }
  });
  it("sortie : dependencySchema { ticket, dependsOn, type }", async () => {
    const o = output("dependency.add");
    expect(await isValid(o, dependency)).toBe(true);
    expect(await isValid(o, { ...dependency, type: "x" })).toBe(false);
    expect(await isValid(o, { ticket: "TK-2", dependsOn: "TK-1" })).toBe(false);
    expect(await isValid(schemas.dependencySchema, dependency)).toBe(true);
  });
});

describe("D2 dependency.remove et dependency.list", () => {
  it("remove : { key, dependsOn, type } -> même triplet", async () => {
    expect(await isValid(input("dependency.remove"), edge)).toBe(true);
    expect(await isValid(input("dependency.remove"), { ...edge, type: "x" })).toBe(false);
    expect(await isValid(input("dependency.remove"), { key: "TK-2", type: "blocks" })).toBe(false);
    expect(await isValid(output("dependency.remove"), edge)).toBe(true);
    expect(await isValid(output("dependency.remove"), { key: "TK-2" })).toBe(false);
  });
  it("list : { key } -> tableau de dépendances", async () => {
    expect(await isValid(input("dependency.list"), { key: "TK-2" })).toBe(true);
    expect(await isValid(input("dependency.list"), { key: "2" })).toBe(false);
    expect(await isValid(output("dependency.list"), [])).toBe(true);
    expect(await isValid(output("dependency.list"), [dependency])).toBe(true);
    expect(await isValid(output("dependency.list"), [{ ...dependency, type: "x" }])).toBe(false);
    expect(await isValid(output("dependency.list"), dependency)).toBe(false);
  });
});

const sprintInput = { goal: "Livrer", startsOn: "2026-11-02", endsOn: "2026-11-13" };

describe("S1 sprint.create : entrée", () => {
  const i = () => input("sprint.create");
  it("accepte des dates ISO, endsOn >= startsOn, definitionOfDone optionnelle", async () => {
    expect(await isValid(i(), sprintInput)).toBe(true);
    expect(await isValid(i(), { ...sprintInput, definitionOfDone: "Tests verts" })).toBe(true);
    expect(await isValid(i(), { ...sprintInput, endsOn: "2026-11-02" })).toBe(true);
  });
  it("rejette endsOn avant startsOn", async () => {
    expect(await isValid(i(), { ...sprintInput, endsOn: "2026-11-01" })).toBe(false);
  });
  it("rejette dates non ISO ou inexistantes, objectif vide ou absent", async () => {
    for (const startsOn of ["demain", "02/11/2026", "2026-13-01", "2026-02-30", ""]) {
      expect(await isValid(i(), { ...sprintInput, startsOn }), startsOn).toBe(false);
    }
    expect(await isValid(i(), { ...sprintInput, endsOn: "bientôt" })).toBe(false);
    expect(await isValid(i(), { ...sprintInput, goal: "" })).toBe(false);
    expect(await isValid(i(), { startsOn: "2026-11-02", endsOn: "2026-11-13" })).toBe(false);
    expect(await isValid(i(), { goal: "g", endsOn: "2026-11-13" })).toBe(false);
  });
});

describe("S2 sprintSchema : sortie", () => {
  it("sprint.create, get, update, activate, close renvoient sprintSchema", async () => {
    for (const name of ["create", "get", "update", "activate", "close"]) {
      const o = output(`sprint.${name}`);
      expect(await isValid(o, sprint), name).toBe(true);
      expect(await isValid(o, { ...sprint, status: "paused" }), name).toBe(false);
      expect(await isValid(o, { ...sprint, key: "SP-0" }), name).toBe(false);
    }
    expect(await isValid(schemas.sprintSchema, sprint)).toBe(true);
  });
  it("accepte les trois statuts, rejette les dates non ISO", async () => {
    for (const status of ["planned", "active", "closed"]) {
      expect(await isValid(schemas.sprintSchema, { ...sprint, status }), status).toBe(true);
    }
    expect(await isValid(schemas.sprintSchema, { ...sprint, startsOn: "lundi" })).toBe(false);
    expect(await isValid(schemas.sprintSchema, { ...sprint, id: "x" })).toBe(false);
  });
});

describe("S3 sprint.get, list, activate, close : entrées", () => {
  it.each(["get", "activate", "close"])("%s : { key } SP-n", async (name) => {
    const i = input(`sprint.${name}`);
    expect(await isValid(i, { key: "SP-1" })).toBe(true);
    for (const key of BAD_SPRINT_KEYS) expect(await isValid(i, { key }), key).toBe(false);
  });
  it("list : filtre de statut optionnel, sortie tableau", async () => {
    const i = input("sprint.list");
    expect(await isValid(i, {})).toBe(true);
    expect(await isValid(i, { status: "active" })).toBe(true);
    expect(await isValid(i, { status: "paused" })).toBe(false);
    expect(await isValid(output("sprint.list"), [sprint])).toBe(true);
    expect(await isValid(output("sprint.list"), [{ ...sprint, status: "x" }])).toBe(false);
    expect(await isValid(output("sprint.list"), sprint)).toBe(false);
  });
});

describe("S4 sprint.update", () => {
  const i = () => input("sprint.update");
  it("accepte des modifications partielles", async () => {
    expect(await isValid(i(), { key: "SP-1", goal: "Nouveau" })).toBe(true);
    expect(await isValid(i(), { key: "SP-1", startsOn: "2026-11-03", endsOn: "2026-11-14" })).toBe(
      true,
    );
    expect(await isValid(i(), { key: "SP-1", definitionOfDone: "ok" })).toBe(true);
  });
  it("rejette objectif vide, dates invalides, intervalle inversé, clé mal formée", async () => {
    expect(await isValid(i(), { key: "SP-1", goal: "" })).toBe(false);
    expect(await isValid(i(), { key: "SP-1", endsOn: "bientôt" })).toBe(false);
    expect(await isValid(i(), { key: "SP-1", startsOn: "2026-11-10", endsOn: "2026-11-01" })).toBe(
      false,
    );
    expect(await isValid(i(), { key: "SP-1", status: "active" })).toBe(false);
    for (const key of BAD_SPRINT_KEYS)
      expect(await isValid(i(), { key, goal: "g" }), key).toBe(false);
  });
});
