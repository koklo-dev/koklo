---
id: R-003
type: contrainte
tables: [T-user]
endpoints: [E-auth-register]
---

## Énoncé
L'email d'un compte est unique : deux comptes ne partagent jamais la même adresse.

## Exemples
- `claire@example.org` est déjà inscrit : un second compte avec cet email est refusé.
- `Claire@Example.org` et `claire@example.org` désignent la même adresse.
