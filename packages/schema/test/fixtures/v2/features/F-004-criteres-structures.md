---
id: F-004
titre: Critères structurés
statut: specifiee
priorite: should
tables: []
endpoints: []
ecrans: [S-register]
roles: []
regles: []
nfr: []
---

## Description
Cas limites valides de l'ordre des étapes Étant donné / Quand / Alors / Et.

## Critères d'acceptation

### AC-1 — Forme minimale
- **Étant donné** un visiteur sur l'écran d'inscription
- **Quand** il valide le formulaire
- **Alors** un message de confirmation s'affiche

### AC-2 — Et rattaché à chaque étape
- **Étant donné** un compte existant
- **Et** un visiteur non connecté
- **Quand** le visiteur s'inscrit avec le même email
- **Et** il clique sur « Créer mon compte »
- **Alors** l'inscription est refusée
- **Et** le message « Cet email est déjà utilisé » s'affiche

### AC-3 — Plusieurs étapes de même type
- **Étant donné** un premier état
- **Étant donné** un second état
- **Quand** une première action a lieu
- **Quand** une seconde action a lieu
- **Alors** un premier résultat est observé
- **Alors** un second résultat est observé
