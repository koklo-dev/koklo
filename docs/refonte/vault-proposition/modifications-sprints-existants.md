# Modifications des sprints existants (à appliquer après le « go »)

> Principe : on ne supprime rien. Un ticket annulé reste dans son sprint, barré, avec une ligne de statut. Un ticket déplacé laisse une ligne de renvoi. Un ticket réécrit garde son numéro ; son nouveau texte vit dans le sprint de destination (voir les fichiers `sprint-0NN.md` de ce dossier).
> Date de toutes les annotations : 2026-11-06. Motif commun : « Refonte du 6 novembre (docs/refonte/feuille-de-route.md) ».

## Contrainte de la boucle (vérifiée le 2026-11-06)

Le lecteur de sprint de la boucle (`~/.claude/shipyard/templates/loop/ticket-backend.sh.tpl`) :
- reconnaît comme ticket toute ligne `- [ ] … **[TK-n]**` ou `- [x] …`, barrée ou non (`_vault_ids_in`, l. 739) ;
- cherche un ticket dans le **premier** fichier `sprint-*.md`, par ordre alphabétique, qui contient `**[TK-n]**` (`_vault_file_for`, l. 679), et y lit son texte et son statut.

Conséquences, appliquées aux formes ci-dessous :
- **Ticket annulé.** Il ne garde ni case à cocher ni la forme `**[TK-n]**` : sinon il compte comme « à faire » et bloque le sprint.
- **Ticket déplacé.** Son ancien sprint ne garde **aucune** occurrence de `**[TK-n]**` : sinon la boucle lirait l'ancien texte (012 passe avant 032).
- Le texte d'origine est conservé sous la ligne d'annotation, inchangé ; seule la ligne de titre change de forme.

## Formes d'annotation

Ticket annulé :
```
- ✖ ~~TK-75 · Runner : bail, worktree, parallélisme, purge~~
  - Statut : **annulé** · 2026-11-06 · décision du 06/11 « les agents tournent en local » (docs/refonte/passations/17) ; remplacé par TK-131
  - (contenu d'origine inchangé en dessous)
```

Ticket déplacé (réécrit ou fusionné) :
```
- ↪ TK-63 · Base : tokens (utilisateur, agent, runner, CI, admin)
  - Statut : **déplacé** · 2026-11-06 · réécrit au sprint 032 (refonte)
  - (contenu d'origine inchangé en dessous)
```

Avant d'appliquer, un contrôle vérifie que chaque `**[TK-n]**` apparaît dans un seul fichier de sprint :
`grep -ho '\*\*\[TK-[0-9a-z]*\]\*\*' sprint-*.md | sort | uniq -d` doit être vide.

## Par sprint

| Sprint | Ticket | Annotation |
|---|---|---|
| 003 | TK-85 | ✖ annulé · remplacé par TK-88 |
| 008 | TK-39 | inchangé (conformité manuelle restante, humain) |
| 010 | TK-55 | inchangé ; à cocher après vérification des critères (55a à 55d fusionnés, #127 à #131) |
| 011 | TK-56 | ✖ annulé · remplacé par TK-126 et TK-127 |
| 011 | TK-57 | ↪ fusionné dans TK-128 (sprint 032) |
| 011 | TK-60 | ✖ annulé · remplacé par TK-104 |
| 011 | TK-61 | ↪ fusionné dans TK-128 (sprint 032) |
| 011 | TK-62 | ↪ réécrit au sprint 031 |
| 012 | TK-63 | ↪ réécrit au sprint 032 |
| 012 | TK-64 | ↪ déplacé au sprint 032 (ajusté) |
| 012 | TK-65 | ↪ déplacé au sprint 033 |
| 012 | TK-66 | ↪ réécrit au sprint 033 |
| 013 | TK-67 | ↪ fusionné dans TK-131 (sprint 033) |
| 013 | TK-68 | ↪ déplacé au sprint 033 |
| 013 | TK-69 | ↪ réécrit au sprint 033 |
| 013 | TK-70 | ↪ déplacé au sprint 034 |
| 015 | TK-75, TK-77 | ✖ annulés · décision du 06/11 |
| 015 | TK-76, TK-78 | ✖ annulés · remplacés par TK-131 |
| 016 | TK-79 | ↪ réécrit au sprint 034 |
| 016 | TK-80 | ↪ fusionné dans TK-134 (sprint 035) |
| 016 | TK-81 | ↪ réécrit au sprint 033 (doctor seul) |
| 016 | TK-82 | ↪ déplacé au sprint 033 |
| 016 | TK-83 | ✖ annulé · remplacé par TK-131 et TK-134 |

## En-têtes de sprint

- **015** et **016** : ajouter sous le titre « > Refonte du 6 novembre : Koklo n'exécute plus d'agent de code (docs/refonte/passations/17). Les tickets restants sont annulés ou déplacés ; voir docs/refonte/feuille-de-route.md §3. » Le Sprint Goal de 016 (« mergé par le serveur sans intervention ») est barré.
- **017** (Bascule) : ajouter « > Remplacé par le sprint 036 (refonte, décision C2) : `koklo deliver` est repensé (TK-137) avant toute bascule. » ; les actions H-18 à H-23 restent pour l'historique (le sprint n'a pas de ticket, la boucle l'ignore).
- **018 à 021** : remplacés par les fichiers de ce dossier (les versions du 05/11 étaient des brouillons de refonte non commencés).
- **022 à 036** : nouveaux fichiers de ce dossier.

## Hors vault

- `.project/state.json` du dépôt : rien à changer à la main ; la boucle reprend au premier sprint qui a du travail.
- Dossier `design/refonte/` du dépôt (copies non suivies des passations du 05/11) : remplacé par `docs/refonte/` ; à supprimer après le « go ».
