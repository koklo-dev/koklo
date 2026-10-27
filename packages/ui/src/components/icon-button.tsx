import type { ComponentProps } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { Button } from "./button.tsx";

export type IconButtonProps = Omit<
  ComponentProps<typeof Button>,
  "size" | "children" | "aria-label"
> & {
  icon: IconName;
  /** Nom accessible, obligatoire : le bouton n'a pas de texte visible. */
  "aria-label": string;
};

/** Bouton carré 36 px portant une seule icône décorative. */
export function IconButton({ icon, ...props }: IconButtonProps) {
  return (
    <Button size="icon" {...props}>
      <Icon name={icon} size={20} />
    </Button>
  );
}
