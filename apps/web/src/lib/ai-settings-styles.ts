/**
 * Boutons des réglages de l'IA : 44 px et pleine largeur sous 768 px, 36 px en rangée dès 768 px. Le libellé passe à la
 * ligne plutôt que de déborder (`whitespace-normal` remplace le `nowrap` du kit) ; l'état désactivé garde l'atténuation
 * du kit, écrite en valeur libre : aucun texte lisible n'est atténué par une classe d'opacité du gabarit.
 */
export const BUTTON_CLASS = "h-11 w-full whitespace-normal disabled:opacity-[0.5] md:h-9 md:w-auto";
