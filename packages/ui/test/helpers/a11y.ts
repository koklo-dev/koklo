/** Nom accessible simplifié : aria-label, aria-labelledby, puis texte hors svg aria-hidden. */
export function accessibleName(el: Element): string {
  const label = el.getAttribute("aria-label")?.trim();
  if (label) return label;
  const ids = el.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
  const referenced = ids
    .map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim() ?? "")
    .join(" ")
    .trim();
  if (referenced) return referenced;
  const clone = el.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll("[aria-hidden='true']")) hidden.remove();
  return clone.textContent?.trim() ?? "";
}

/** Lève si l'élément n'a pas de nom accessible (CA2 : bouton d'icône sans aria-label). */
export function expectAccessibleName(el: Element): void {
  if (accessibleName(el) === "") {
    throw new Error(`Bouton sans nom accessible : ${el.outerHTML}`);
  }
}
