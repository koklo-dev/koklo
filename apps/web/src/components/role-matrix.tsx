import {
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  YesNoCell,
} from "@koklo/ui";
import { MATRIX_ROLES, ROLE_MATRIX } from "../lib/members-labels.ts";

const TITLE = "Ce que chaque rôle peut faire";

/**
 * Neuf actions x six rôles : `YesNoCell` (coche ou tiret nommés « Oui » / « Non » sous leur colonne). Le cadre
 * défilant de `Table framed` est la région atteignable au clavier ; le résumé est la barre `--surface` du dépliant.
 */
export function RoleMatrix() {
  return (
    <Card asChild className="overflow-hidden p-0">
      <details>
        <summary className="cursor-pointer bg-surface px-4 py-3 text-subsection-title focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {TITLE}
        </summary>
        <Table framed aria-label={TITLE} frameClassName="rounded-none border-0 border-t">
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              {MATRIX_ROLES.map(({ role, label }) => (
                <TableHead key={role} className="text-center">
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROLE_MATRIX.map(({ action, allowed }) => (
              <TableRow key={action}>
                <TableCell>{action}</TableCell>
                {MATRIX_ROLES.map(({ role }, index) => (
                  <YesNoCell key={role} value={allowed[index] === "y"} />
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </Card>
  );
}
