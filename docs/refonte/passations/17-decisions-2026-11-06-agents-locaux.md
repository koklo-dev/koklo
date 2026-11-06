# Décision du 06/11/2026 : les agents de code tournent en local

> Décidée par Brice le 06/11/2026, à la recette du lot 12. Complète `koklo-conception-v0.6.md` (§8 CLI et MCP, §22 workflows et gates) et l'emporte en cas de contradiction.

## 1. La décision

1. **Koklo n'exécute aucun agent de code.** Pas de serveurs d'exécution à financer au démarrage. Un agent tourne **sur le poste d'un membre de l'équipe**, avec l'outil de son choix (Claude Code, Codex, Cursor, autre).
2. **L'agent parle à Koklo par le MCP Koklo** (et le CLI `koklo`) : il prend un ticket, reçoit sa tranche de spec, remonte son avancement et le résultat des étapes. Koklo affiche ces remontées.
3. **La clé d'IA de l'organisation (BYOK) ne sert qu'au travail en ligne de Koklo** : cadrage (espace Idée, livrables de la spec, bouton « Proposer avec l'agent »), récapitulatif de la baseline, découpage en tickets. Elle ne paie jamais les jetons d'un agent de code : chacun utilise son propre outil et son propre abonnement.
4. **Les contrôles qui font foi tournent en CI** (`koklo verify`, tests, captures), jamais sur la seule déclaration de l'agent (inchangé, conception §22.4). La revue humaine reste obligatoire pour fusionner.
5. **Plus tard**, un exécuteur dans le cloud pourra s'ajouter comme une option (même protocole MCP) ; il n'est pas dans la vision actuelle.

## 2. Ce que ça change dans le produit

| Avant | Maintenant |
|---|---|
| « Lancer une session d'agent » depuis Koklo | « Prendre ce ticket sur votre poste » : `koklo ticket start TK-108`, ou demander à son agent « prends le ticket TK-108 » (outil MCP) |
| « 3 agents autorisés en parallèle » | « 2 agents connectés · postes de Moussa et d'Awa » |
| Coût en jetons sur la clé de l'organisation | « Jetons consommés par l'outil de Moussa, jamais par la clé de l'organisation » |
| « Arrêter la session » | « Libérer le ticket » (la branche et le travail restent sur le poste) |
| Session toujours à jour | Nouvel état **Sans nouvelles** (pas de remontée depuis 20 min) : pastille ambre `wifi_off` |
| Glisser vers « En cours » démarre un agent | Le ticket devient « En cours » ; message « à prendre en local : koklo ticket start TK-108 » |

## 3. Outils MCP / CLI concernés

| Outil | Rôle |
|---|---|
| `koklo ticket start <TK>` / outil `ticket.start` | crée la branche, ouvre la session, renvoie la tranche de spec (figée sur la baseline) |
| `ticket.progress` | étape courante du workflow, message court (alimente la carte et l'onglet Session) |
| `gate.report` | résultat indicatif d'un contrôle local (celui de la CI fait foi) |
| `ticket.release` | libère le ticket |
| battement (dans `ticket.progress`) | au-delà de 20 min sans remontée : état « Sans nouvelles » |

Chaque session enregistre : ticket, membre, outil déclaré (Claude Code, Codex, Cursor…), poste, dernière remontée, étapes.
