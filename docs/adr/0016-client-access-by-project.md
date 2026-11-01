---
doc_version: 0.1.0
status: proposed
last_reviewed: 2026-11-02
covers_commit: b69cf16
---
# 0016 — Accès client par projet : table de liaison `project_client_access` et cloisonnement central

- **Statut** : proposé (TK-55a ; ticket `sensitive`, entérinement humain requis avant fusion)
- **Date** : 2026-11-02
- **Décideurs** : tech-lead, developer (ticket TK-55, décisions D1 et D7)

## Contexte
Les tickets, sprints, commentaires, baux, dépôts et lots de spec se résolvent par le « plus ancien projet de
l'organisation » (`OldestProjectContext`) ou par un `projectId` d'entrée. Le seul contrôle d'appartenance était
l'**organisation** : un membre au rôle `client` voyait donc **tous** les projets de son organisation (faille IDOR
constatée à l'analyse de TK-55). La vision (§14) veut qu'un client ne voie que les projets qui le concernent.
`AuthSession.role` est de plus optionnel dans le type : une session sans rôle (session de test, résolveur
incomplet) ne doit jamais ouvrir l'accès.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. Table de liaison `project_client_access (organization_id, project_id, user_id)` + cloisonnement central côté API | Explicite, auditable, réversible ; les FK composites interdisent un lien inter-organisations ; un seul point d'étranglement dans l'API | Une table, une requête de plus par appel |
| B. Colonne `project_id` sur `members` | Aucune table | Un client n'a qu'un projet ; mélange identité d'organisation et accès |
| C. Un client = une organisation dédiée | Aucun changement de code | Casse la vision (un client est membre de l'organisation de l'équipe) ; invitations et facturation à dupliquer |
| D. Filtre dans chaque service | Aucune table centrale | Oubli certain, non testable globalement |

## Décision
Option A.
- Table `project_client_access` : FK composites vers `projects(organization_id, id)` et `members(organization_id, user_id)` (`ON DELETE CASCADE`), `UNIQUE (project_id, user_id)`, `created_by_user_id` sans FK. Que le membre ait le rôle `client` est un invariant d'API (la base le laisse passer).
- Cloisonnement **central** et **fail-closed** : `isProjectScoped(role)` est vrai pour tout rôle hors des cinq `STAFF_ROLES` (donc `client`, absent, vide ou inconnu). `scopeOf`, `inScope`, `inProject`, `OldestProjectContext` et `project.list` passent par `ProjectAccess` (`assertAccessible`, `linkedProjectIds`) ; un rôle d'équipe n'a besoin d'aucun lien.
- **404 uniforme** : client non lié, projet d'une autre organisation, projet inconnu et ressource absente d'un projet accessible renvoient le même `NOT_FOUND` (« Ressource introuvable »), jamais `FORBIDDEN`. Le garde de rôle (403) précède le cloisonnement (404).
- Groupe oRPC `projectClient` (`list`, `add`, `remove`), réservé à owner et admin, audit `project_client.add|remove` sans contenu libre. Un 422 `VALIDATION` unique couvre membre non client, d'une autre organisation ou inconnu.
- `member.setRole` purge les liens du membre dans la même transaction quand il quitte le rôle `client`.
- `spec.head|listFeatures|getFeature` sont **fermés au client** (403, D7) : le vocabulaire git (branche, SHA, chemins) n'est pas le sien ; l'espace client (TK-55b) lui donnera sa propre vue.
- Contrat 0.8.0 vers 0.10.0 (0.9.0 est réservée à TK-54).

## Conséquences
- `spec.*` change de comportement pour un client : 200 devient 403 (tests de TK-45c2 mis à jour volontairement).
- Un rôle d'équipe ou business appelant une procédure de projet fait une lecture d'existence de plus (projet de l'organisation) ; un client en fait une seule (existence et lien dans la même requête).
- Un client dont tous les liens sont retirés voit `project.list` vide et reçoit 404 partout (jamais d'erreur 5xx).
- La session de test par en-tête (`x-test-session`) relit le rôle en base ; un utilisateur non membre est sans rôle, donc cloisonné.
- Les tests d'isolation entre organisations et entre clients d'une même organisation sont des garde-fous : ne pas les assouplir.

## Limites
- **N2** : les rôles d'équipe et business gardent toute l'organisation ; seul le client est cloisonné.
- **N3** : aucun écran ne permet encore de lier un client (ni `member.invite` avec un projet) ; ticket web à prévoir. Aujourd'hui le lien se pose par l'API `projectClient.add`.
- Si le rôle d'un membre change hors de l'API (SQL), ses liens subsistent mais sont ignorés tant qu'il n'est pas client.
- La **durée de réponse n'est pas un oracle** : le refus coûte un aller-retour de requête dans tous les cas (test à tolérance large), mais aucune garantie de temps constant n'est donnée.
