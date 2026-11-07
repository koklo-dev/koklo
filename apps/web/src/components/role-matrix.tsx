import { Icon, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@koklo/ui";
import { MATRIX_ROLES, ROLE_MATRIX } from "../lib/members-labels.ts";

const TITLE = "Ce que chaque rôle peut faire";

/**
 * Neuf actions x six rôles : coche ou tiret, doublés d'un nom accessible par cellule (« Client : oui »).
 * Le conteneur défilant est la région focusable elle-même (le composant `Table` en pose un second, sans focus).
 */
export function RoleMatrix() {
  return (
    <details className="rounded-lg border">
      <summary className="cursor-pointer rounded-lg p-4 text-body font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {TITLE}
      </summary>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: conteneur défilant, atteignable au clavier (WCAG 2.1.1) */}
      <section aria-label={TITLE} tabIndex={0} className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              {MATRIX_ROLES.map(({ role, label }) => (
                <TableHead key={role}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROLE_MATRIX.map(({ action, allowed }) => (
              <TableRow key={action}>
                <TableCell>{action}</TableCell>
                {MATRIX_ROLES.map(({ role, label }, index) => {
                  const yes = allowed[index] === "y";
                  return (
                    <TableCell key={role} aria-label={`${label} : ${yes ? "oui" : "non"}`}>
                      <Icon
                        name={yes ? "check" : "remove"}
                        size={18}
                        className={yes ? "text-foreground" : "text-muted-foreground"}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </section>
    </details>
  );
}
