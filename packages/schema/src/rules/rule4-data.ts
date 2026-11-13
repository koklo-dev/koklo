import type { TableV2 } from "../entities/index.ts";
import type { ParsedSpec } from "../types.ts";
import type { SpecIndex } from "./index.ts";
import type { Collect, Emit } from "./rule4-links.ts";

const REF_TYPE = /^ref\((T-[a-z0-9][a-z0-9-]*)\)$/;

function checkSource(table: TableV2, index: SpecIndex, emit: Emit): void {
  (table.source ?? []).forEach((id, i) => {
    if (id.startsWith("R-")) {
      if (!index.rules.has(id))
        emit("R4_UNKNOWN_RULE", `/source/${i}`, `La règle ${id} n'existe pas.`);
    } else if (!index.features.has(id)) {
      emit("R4_UNKNOWN_FEATURE", `/source/${i}`, `La feature ${id} n'existe pas.`);
    }
  });
}

function checkFields(table: TableV2, index: SpecIndex, emit: Emit): void {
  table.champs.forEach((field, i) => {
    if (field.regle !== undefined && !index.rules.has(field.regle)) {
      emit("R4_UNKNOWN_RULE", `/champs/${i}/regle`, `La règle ${field.regle} n'existe pas.`);
    }
    const target = REF_TYPE.exec(field.type)?.[1];
    if (target !== undefined && !index.tables.has(target)) {
      emit(
        "R4_UNKNOWN_TABLE",
        `/champs/${i}/type`,
        `La table ${target} citée par le champ ${field.nom} n'existe pas.`,
      );
    }
  });
}

function checkRelations(table: TableV2, index: SpecIndex, emit: Emit): void {
  (table.relations ?? []).forEach((relation, i) => {
    if (index.tables.has(relation.vers)) return;
    emit(
      "R4_UNKNOWN_TABLE",
      `/relations/${i}/vers`,
      `La table ${relation.vers} citée par la relation n'existe pas.`,
    );
  });
}

/** Règle 4 des tables v2 (`source`, `regle`, `ref(T-x)`, `vers`) et des jeux d'exemple (`table`, clés de `lignes`), B386. */
export function checkDataLinks(spec: ParsedSpec, index: SpecIndex, at: Collect): void {
  for (const { path, value: table } of spec.tables) {
    if (!("nom" in table)) continue;
    const emit = at(path, table.id);
    checkSource(table, index, emit);
    checkFields(table, index, emit);
    checkRelations(table, index, emit);
  }
  for (const { path, value: fixture } of spec.fixtures) {
    const emit = at(path, fixture.id);
    const fields = index.tables.get(fixture.table);
    if (fields === undefined) {
      emit("R4_UNKNOWN_TABLE", "/table", `La table ${fixture.table} du jeu n'existe pas.`);
      continue;
    }
    fixture.lignes.forEach((row, i) => {
      for (const key of Object.keys(row)) {
        if (fields.has(key)) continue;
        emit(
          "R4_UNKNOWN_FIELD",
          `/lignes/${i}/${key}`,
          `Le champ « ${key} » n'existe pas dans la table ${fixture.table}.`,
        );
      }
    });
  }
}
