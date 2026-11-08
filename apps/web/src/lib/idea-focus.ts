/**
 * Focus après une décision sur une proposition (WCAG 2.4.3) : l'élément qui portait le focus disparaît à la
 * relecture et le focus tomberait sur <body>. `find` reçoit le nombre d'images restantes ; tant qu'il rend `null`,
 * on réessaie à l'image suivante (le rendu suit la relecture).
 */
export function focusWhenReady(
  find: (left: number) => HTMLElement | null | undefined,
  left = 40,
): void {
  const target = find(left);
  if (target) {
    target.scrollIntoView({ block: "center" });
    target.focus();
    return;
  }
  if (left > 0) requestAnimationFrame(() => focusWhenReady(find, left - 1));
}

/** Premier élément affiché (le menu mobile et l'arborescence de bureau ne le sont jamais ensemble). */
export const visible = (elements: Iterable<HTMLElement>): HTMLElement | undefined =>
  [...elements].find((element) => element.getClientRects().length > 0);

/** Bouton « Annuler » de la trace d'une décision (l'arborescence et le menu mobile en rendent chacun une copie). */
export const undoButtonOf = (proposalId: string): HTMLElement | null =>
  visible(document.querySelectorAll<HTMLElement>(`[data-notice-id="${proposalId}"] button`)) ??
  null;

/** Éditeur de la page ouverte. */
export const editorOf = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-testid='idea-editor'] [contenteditable]");

/** Saisie « Message à l'agent » (affichée). */
export const composerOf = (): HTMLElement | null =>
  visible(document.querySelectorAll<HTMLElement>("aside[aria-label='Agent'] textarea")) ?? null;

/** Boutons dont le texte est exactement `name`. */
export const buttonsNamed = (name: string): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>("button")].filter(
    (button) => button.textContent?.trim() === name,
  );

/**
 * Une trace qui s'efface d'elle-même (fin des 10 s pour annuler) ne doit pas emporter le focus : s'il y était, il
 * passe à l'éditeur (trace d'une page ouverte), sinon à « Ajouter une page » ou au menu des pages.
 */
export function rescueNoticeFocus(proposalId: string, pageId: string | null): void {
  const active = document.activeElement;
  if (!active?.closest(`[data-notice-id="${proposalId}"]`)) return;
  focusWhenReady(() =>
    pageId
      ? editorOf()
      : (visible(buttonsNamed("Ajouter une page")) ??
        visible(
          document.querySelectorAll<HTMLElement>("nav[aria-label='Pages du dossier'] button"),
        )),
  );
}
