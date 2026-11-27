import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import type { AccessLevel, MatrixRole } from "./permission-matrix.tsx";

export interface CompactMatrixAction {
  id: string;
  label: string;
  /** Un accès par rôle, dans l'ordre de `roles`. */
  access: ReadonlyArray<{ level: AccessLevel; restriction?: string | undefined }>;
}

export interface CompactMatrixProps {
  roles: readonly MatrixRole[];
  actions: readonly CompactMatrixAction[];
  className?: string;
}

const LEVELS: Record<AccessLevel, { icon: IconName; tone: string; word: string }> = {
  allowed: { icon: "check", tone: "text-status-validated-foreground", word: "oui" },
  denied: { icon: "remove", tone: "text-border-strong", word: "non" },
  restricted: { icon: "rule", tone: "text-status-pending-icon", word: "restreint" },
};

/** Case courte : l'icône porte le nom « rôle : oui, non, restreint (texte) » ; la restriction s'écrit à côté. */
function Cell({
  role,
  level,
  restriction,
}: {
  role: string;
  level: AccessLevel;
  restriction?: string | undefined;
}) {
  const { icon, tone, word } = LEVELS[level];
  const detail = level === "restricted" && restriction ? restriction : undefined;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon
        name={icon}
        size={18}
        className={cn("shrink-0", tone)}
        title={`${role} : ${word}${detail ? ` (${detail})` : ""}`}
      />
      {detail ? (
        <span aria-hidden="true" className="text-caption font-normal text-muted-foreground">
          {detail}
        </span>
      ) : null}
    </span>
  );
}

/**
 * « Qui peut faire quoi », forme courte de la Sécurité (DESIGN.md §5.28, maquette 15 l.174-179) : sans filtre ni
 * groupes, 820 px au moins avec défilement dans son cadre focusable.
 */
export function CompactPermissionMatrix({ roles, actions, className }: CompactMatrixProps) {
  return (
    <section
      data-slot="permission-matrix"
      data-variant="compact"
      aria-label="Matrice des droits, défilement horizontal"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: région qui défile, atteignable au clavier (WCAG 2.1.1)
      tabIndex={0}
      className={cn(
        "min-w-0 overflow-auto rounded-xl border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <table className="w-full min-w-[820px] border-collapse text-meta">
        <caption className="sr-only">Matrice des droits</caption>
        <thead>
          <tr className="bg-surface text-left text-caption text-muted-foreground">
            <th scope="col" className="px-3.5 py-[9px] font-medium">
              Action
            </th>
            {roles.map((role) => (
              <th key={role.id} scope="col" className="px-2 py-[9px] font-medium">
                {role.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={action.id} className="border-t border-border">
              <th scope="row" className="px-3.5 py-2.5 text-left font-medium">
                {action.label}
              </th>
              {roles.map((role, index) => (
                <td key={role.id} className="px-2 py-2.5">
                  <Cell role={role.name} {...(action.access[index] ?? { level: "denied" })} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
