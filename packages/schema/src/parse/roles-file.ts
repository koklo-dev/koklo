import type { RolesFile } from "../entities/index.ts";
import { structIssue } from "../issue.ts";
import type { Issue } from "../types.ts";

function duplicatesOf(list: readonly { id: string }[], key: string, path: string): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  list.forEach(({ id }, i) => {
    if (seen.has(id)) {
      const message = `L'identifiant ${id} est défini plusieurs fois dans ${path}.`;
      out.push(structIssue("STRUCT_DUPLICATE_ID", path, message, `/${key}/${i}/id`, id));
    }
    seen.add(id);
  });
  return out;
}

/** Ids de rôle ou de permission répétés dans `domain/roles.yaml` (2e occurrence et suivantes). */
export function duplicateIdIssues(path: string, file: RolesFile): Issue[] {
  return [
    ...duplicatesOf(file.roles, "roles", path),
    ...duplicatesOf(file.permissions, "permissions", path),
  ];
}
