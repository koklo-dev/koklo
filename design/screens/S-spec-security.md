---
id: S-spec-security
titre: Spec · Sécurité (Prêt, Génération, Relecture, Liste · équipe, Validé, À revoir, Vue client ; onglets Menaces, Données sensibles, Droits, Exigences, Résumé client, Document)
version: 4
---
> Maquette qui fait foi : `docs/refonte/maquettes/15-Lot14Securite.html` (`pnpm maquette 15`), passations 21 §1, §2 et §4 (hors `audit.*`), 11, 14, 07. Même socle que [S-spec-technical](S-spec-technical.md). Écarts : `docs/refonte/ecarts.md` ; décisions B790 à B813.

## 1. Utilisateurs et objectif
Équipe : owner, admin et développeur proposent, relisent, modifient, classent et valident ; designer lit. Client : lit le résumé en mots simples, pose une question, indique la personne à prévenir en cas d'incident. Business : lit le résumé sans agir. Objectif : savoir ce qui peut arriver, quelles données sont sensibles, qui a le droit de faire quoi, et le dire simplement au client. Entrée : « 5 Sécurité » (`shield`), « Disponible après le technique ».

## 2. Tâches et parcours
Prêt → « Proposer avec l'agent » ou « Nouvelle menace » → Génération → Relecture (onglet devant) → « Enregistrer N propositions » → Liste · équipe. Tâche principale : traiter les menaces de gravité élevée et classer les données, puis « Valider ». Secondaires : niveau ASVS, registre RGPD, résumé client, document. Après un changement amont : À revoir → « Proposer les mises à jour » → relecture → revalidation. Client : barre « 5 Sécurité » (« Résumé ») → résumé → question ou contact.

## 3. Contenu
En-tête : fil « Projet / Spec / Sécurité », h1 « Sécurité », statut, résumé sur sa ligne (menaces, traitées, données classées, scénarios d'abus, niveau ASVS, blocages), actions. Onglets avec icône et compte : Relecture (`rate_review`), Menaces (`gpp_maybe`), Données sensibles (`badge`), Droits (`admin_panel_settings`), Exigences (`verified_user`, « couvertes/total » s'il manque des réponses), Résumé client (`summarize`), Document (`description`).

- **Menaces** (`security.threat.list`, `.byId`) : recherche, puces Toutes, Gravité élevée, À traiter, Vérifiées par la CI ; « N menaces · M traitées · K de gravité élevée » et pastille « N à traiter » ; groupes repliables par surface (identifiant mono, titre, « N menaces ») ; ligne : `SEC-Txx`, titre, gravité (Élevée en `danger`, Moyenne et Faible en contour), état (Traitée, À traiter, Proposée, À revoir). Fiche à droite : catégorie, « Gravité … », identifiant, « Modifier » ; titre ; segmenté Fiche · Scénario d'abus ; « Ce qui peut arriver » ; encadré ambre et « Proposer une parade » (élevée sans parade) ; Parades ; « Fonctionnalité » et « Touche » en puces ; vérification. Scénario : chemin, « Scénario d'abus généré », Gherkin (ou la mention d'un contrôle de la CI ou d'une revue humaine).
- **Données sensibles** (`security.data.list`) : bandeau hébergement, sous-traitants, transferts (« à préciser » si inconnu), « Classer une donnée », « Registre RGPD » ; recherche et puce « À décider » au-delà de 50 lignes ; tableau Donnée, Champ, Catégorie, Conservation, Qui y accède, Protection, action ; ligne non décidée ambre et « Décider » ; phrase de règle en pied.
- **Droits** (`security.rights.get`) : phrase d'introduction ; matrice action × rôle (`check`, `remove`, `rule` ambre avec le texte) ; « Règles de propriété » ; « Scénarios d'abus générés » (compte).
- **Exigences** (`security.asvs.report`) : « Niveau d'exigence · OWASP ASVS », niveaux 1, 2, 3 (le recommandé marqué « · recommandé ») ; tableau Chapitre, Exigences couvertes (barre), Où c'est répondu, État (« Couvert », « N sans réponse », « À vérifier ») ; « Secrets et dépendances » (« À préciser » si vide) ; « Une pull request ne fusionne pas si… » (texte de la passation, sans nom d'outil).
- **Résumé client** (`security.summary.get`, `clientSpace.security`) : bandeau d'introduction ; « Mettre à jour avec l'agent » ; proposition en pointillés (Accepter, Rejeter) ; sept cartes, la dernière sur toute la largeur ; « Ce que nous attendons de vous » ; pied « Résumé rédigé depuis le livrable Sécurité, relu par l'équipe le … · sans identifiants techniques. » (sans la partie « relu » avant relecture).
- **Document** : `SpecDocumentTab` partagé ; sections 01 à 07, section proposée « Sauvegardes et restauration » ; colonne Agent : « Rédiger les sections à rédiger », « Vérifier la cohérence avec les menaces », « Mettre à jour le résumé client ».

## 4. États
| État | Rendu |
|---|---|
| Prêt (aucun élément) | `EmptyState` `shield`, « L'agent peut proposer le modèle de menaces », « Proposer avec l'agent » et « Écrire à la main » ; en-tête « Prêt » · « Le technique est validé » |
| Génération | `ProposalGenerationBanner` `role="status"` (« L'agent prépare la sécurité : menaces, données, droits puis document. Les premières propositions arrivent avant la fin. Vous pouvez quitter la page. » + « Annuler l'attente »), squelette |
| Relecture | « En cours » · « N propositions à relire · M acceptées » ; groupes Menaces, Données sensibles, Droits, Exigences, Document ; détail : genre, identifiant, titre, justification, Gherkin ou texte, liens, Accepter, Modifier, Rejeter ; « Enregistrer N propositions » (un lot) |
| Liste · équipe | « Validation de l'équipe · le client lit le résumé » ; « Valider » désactivé pointillé avec la raison dans le résumé |
| Validé | « Validé par l'équipe » ; « Validé par <prénom> le <date> · version <sha> · le résumé rejoint la baseline 0 » ; plus de « Valider » |
| À revoir | `InlineAlert` `warning` `role="alert"` (`sync_problem`) : livrable amont, version, changements, « Sont concernés : … », « Proposer les mises à jour » (absent si l'agent est fermé, B755) ; lignes concernées « À revoir » ; actions Nouvelle menace, Proposer les mises à jour, Valider ; s'il reste un blocage, le résumé ajoute sa raison après « Validé le …, le cahier technique a changé depuis » |
| Vue client | « Résumé pour vous » ; seul onglet « Résumé » ; « Poser une question » ; encadré ambre tant qu'aucun contact, bordé ensuite avec « Modifier » ; non validé : `EmptyState` `schedule` « en cours de validation par l'équipe » |
| Vide par onglet | « Aucune menace pour l'instant », « Aucune donnée à classer », « Aucun rôle dans le cahier fonctionnel », « Aucun résumé pour l'instant » ; recherche ou filtre sans résultat : « Effacer la recherche » |
| Chargement | Squelettes à la taille des groupes, tableaux et cartes ; « Valider » désactivé |
| Erreur | `ErrorNotice` + « Réessayer » ; quota GitHub : « GitHub limite les lectures, réessayez dans N min. » |
| Droits | Designer sans bouton d'écriture ; client et business : refus serveur sur tout sauf le résumé ; business sans « Poser une question » ni contact |
| Étape écartée (TK-115b) | Bandeau du bilan (DESIGN §5.25, `role="note"`, « étapes ») en Relecture ; plus rien à relire : sur « Menaces » vide (sans filtre) et au-dessus de « Prêt » ; seulement pour qui peut proposer |

## 5. Interactions et retours
Feuille « Menace » : Titre, Catégorie, Gravité (aide « Élevée : données de clientes ou argent en jeu. Une menace élevée sans parade bloque la validation. »), Fonctionnalités exposées (puces, « API » admis), Ce qui peut arriver, Parades (une par ligne), Vérification ; préremplissage par l'agent. Feuille « Donnée » : Champ (mono, `table.champ`), Catégorie, Conservation (« Une durée, et à partir de quand. »), Qui y accède (puces), Protection ; l'agent ne remplit jamais Conservation, sa suggestion est une aide « Proposée par l'agent : … ». « Décider » ouvre la feuille sur la ligne, Conservation en focus. Modification d'un livrable validé : avertissement commun. Niveau ASVS : choix immédiat, toast « Niveau enregistré ». « Registre RGPD » télécharge `registre-rgpd-<projet>.md`. « Proposer une parade » et « Proposer les mises à jour » ouvrent la fenêtre de l'agent avec une consigne préremplie. Contact : carte de saisie (nom, téléphone), « Enregistrer », « Annuler ». Question : zone de texte, « Envoyer » ; toast « Question envoyée à l'équipe ». Refus de validation : alerte au-dessus de l'onglet, focus au titre après succès.

## 6. Responsive
Sous 768 px : menaces en liste puis fiche (« ← Liste ») ; onglets défilant sur une ligne ; tableaux (données 980, droits 820, exigences 760) en défilement interne focusable et nommé ; panneaux et cartes en une colonne ; relecture liste puis détail ; Document : sections au-dessus ; feuilles plein écran ; cibles 44 px ; aucun défilement horizontal de page.

## 7. Accessibilité
Ordre : en-tête, bandeau, onglets, filtres, liste, fiche. Onglets `nav` avec `aria-current` ; groupes `button aria-expanded` ; lignes `button aria-current` dont le nom porte gravité et état ; puces `aria-pressed` ; niveaux `radiogroup` (flèches) ; tableaux avec `th scope` et légende ; cases de la matrice nommées « <rôle> : oui | non | restreint (<texte>) » ; couleur toujours doublée d'un texte ou d'une icône ; barres de couverture décoratives, valeur écrite. Échap ferme et rend le focus ; ⌘/Ctrl Entrée enregistre. Annonces `role="status"` : compte, « Menace enregistrée », « Donnée classée », « Niveau enregistré », « Résumé client mis à jour », « Contact enregistré », « Question envoyée à l'équipe », « Sécurité validée ». Mouvement réduit respecté.

États à comparer à la maquette : 1 Menaces et fiche `SEC-T08`, clair 1440 ; 2 même, sombre ; 3 liste et fiche à 375 px ; 4 Données sensibles avec « Décider », clair ; 5 Résumé en vue client, clair ; 6 Prêt, sombre (sans planche).

## 8. Alternatives écartées
- Matrice des droits modifiable sur l'écran : écartée, les permissions appartiennent au Fonctionnel ; la Sécurité ne fait que restreindre, par une proposition relue (B794).
- Reprendre `PermissionMatrix` telle quelle (filtre, « autorisé ») : écartée, la maquette 15 demande des cases courtes ; une variante de la même famille.
- Une durée de conservation préremplie à valider d'un clic : écartée (A7), la valeur doit être saisie.
- Contact d'incident écrit dans le dépôt de spec : écarté, donnée personnelle hors Git (B801).
- Catalogue ASVS complet embarqué : écarté, rien dans les passations ; les exigences viennent des propositions relues (B798).

## 9. Questions ouvertes
Relecture juridique des conservations et du registre avant la production (A7). Le résumé annonce la baseline 0, livrée plus tard (TK-126). Les contrôles de CI décrits arrivent avec TK-133.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-27 | TK-117 | Création : page du livrable Sécurité (passation 21, maquette 15), B790 à B813 |
| 2 | 2026-11-27 | TK-117 | Écran livré : champ « Donnée » dans sa feuille, résumé relu sur place, attente du contact masquée au business (B831 à B835) |
| 3 | 2026-11-27 | TK-117 | Correction de revue : raison du blocage à revoir, puces bordées de la fiche, bouton neutre de l'encadré, ligne de menace sur une ligne à 375 px, pied du résumé (B837) |
| 4 | 2026-11-27 | TK-115b | Bilan du lancement et étapes écartées avec leur motif (B848 à B850). |
