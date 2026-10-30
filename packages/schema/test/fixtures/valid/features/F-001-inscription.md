---
id: F-001
titre: Inscription par email
statut: implementee
priorite: must
tables: [T-user]
endpoints: [E-auth-register]
ecrans: [S-register, S-register-success]
roles: [RL-visiteur]
regles: [R-003]
nfr: [NFR-001]
---

## Description
L'utilisateur crée un compte avec email et mot de passe.

## Critères d'acceptation

### AC-1 — Email déjà utilisé
- **Étant donné** un compte existant avec l'email `claire@example.org`
- **Quand** un visiteur s'inscrit avec `claire@example.org`
- **Alors** l'inscription est refusée
- **Et** le message « Cet email est déjà utilisé » s'affiche sous le champ email

### AC-2 — Longueur du mot de passe
- **Étant donné** un visiteur sur l'écran d'inscription
- **Quand** il saisit un mot de passe de moins de 12 caractères
- **Alors** le bouton « Créer mon compte » reste désactivé

### AC-3 — Email de confirmation
- **Étant donné** une inscription valide
- **Quand** le compte est créé
- **Alors** un email de confirmation est envoyé à l'adresse saisie
