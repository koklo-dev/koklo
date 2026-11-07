---
id: S-ai-settings
titre: Fournisseurs d'IA (réglages de l'organisation)
version: 2
---
## 1. Utilisateurs et objectif
Propriétaires et administrateurs (section `ai` de Réglages, groupe Organisation). Les autres rôles n'ont pas l'entrée ; un accès direct redirige vers leur section par défaut (B112) et le serveur répond 403 à toute procédure. Objectif : choisir quels fournisseurs d'IA l'organisation utilise (une clé BYOK par fournisseur, facturée par le fournisseur), lequel est principal ou de secours, quel modèle sert chaque usage, et suivre la consommation. Ce que l'on ne peut jamais faire : relire une clé. Remplace la v1 (une seule clé Anthropic). Sources : passation 19 §2.3, 20, maquette `24-Lot13Reglages.html`, décisions B121 à B130.

## 2. Tâches et parcours
- Principale : **Ajouter un fournisseur** -> choisir (6 cartes radio) -> clé (+ adresse de l'API pour Compatible OpenAI, + « Modèle à utiliser » si aucun modèle qualifié) -> **Vérifier et enregistrer** (requête de test avant tout enregistrement).
- Secondaires : Mettre en principal, Vérifier, Remplacer la clé, Retirer (non offert sur le principal) ; **Modèle par usage** (Changer) ; interrupteur de secours ; plafond mensuel.
- Entrées : « Réglages > Fournisseurs d'IA », lien « Configurer l'IA » du cadrage (owner/admin).

## 3. Contenu
Ordre : intro -> bloc d'envoi (texte sans nom de fournisseur, B15) -> Fournisseurs -> Modèle par usage -> Basculer sur le fournisseur de secours -> À quoi servent ces clés -> Consommation du mois.
- Ligne de fournisseur (`aiProvider.list`) : initiales, nom, pastille **Principal** (primaire) ou **Secours** (neutre), statut « Vérifiée le <date> » / « Non vérifiée » / « Refusée » (icône + texte, B125), OpenRouter : pastille ambre **Intermédiaire** + « Vos requêtes passent par OpenRouter avant d'arriver au fournisseur du modèle. Il n'est pas proposé sur un projet qui exige des données en UE. » (partiel, A5).
- Modèle par usage (`aiSettings.get`, `aiModel.listQualified`) : 4 usages, puce mono « Fournisseur · modèle », **Changer** (`aria-expanded`) -> `listbox` des modèles qualifiés des fournisseurs porteurs d'une clé valide, badge « économique ». Fournisseur retiré -> l'usage retombe sur le défaut du principal.
- Secours : `role="switch"`, texte dynamique (« Si X répond en erreur ou atteint sa limite, la demande repart chez Y… »), désactivé avec « Ajoutez un deuxième fournisseur pour activer le secours. » ; au-delà de 2 clés, choix du fournisseur de secours (B124).
- Consommation (`aiUsage.report`) : « Consommation de <mois> », total « ≈ x € » (B126, 1 USD = 1 EUR, estimation), jetons, une barre par fournisseur (nom + valeur en texte), plafond mensuel tous fournisseurs en euros (vide = sans plafond, A1), message d'alerte à 80 % et de suspension au plafond.

## 4. États
Chargement : `role="status"` + squelettes. Vide : « Aucun fournisseur configuré. L'IA est indisponible. », formulaire d'ajout ouvert. Erreur : `ErrorNotice` + Réessayer. Droits : `Alert` lock, aucun appel. Propres : test en cours (`aria-busy`), test échoué (clé non gardée, message sans nom de fournisseur), clé refusée (« Refusée », Remplacer en évidence), plafond atteint, un seul fournisseur (secours désactivé), aucun modèle qualifié pour un fournisseur.

## 5. Interactions et retours
Clé : champ `type=password`, `autocomplete=off`, `maxLength=512`, non contrôlé, vidé après succès **et** échec ; jamais réaffichée. Succès : ligne ajoutée, annonce `role="status"`. Échec : `role="alert"` + focus. Retrait : confirmation en ligne (`Garder` au focus, Échap garde, bouton destructeur `Retirer`), pas de modale. Changer de principal : confirmation courte (« X devient principal, Y passe en secours »).

## 6. Responsive
Sous 768 px : actions d'une ligne sous le nom (cibles 44 px), cartes radio sur une colonne, options de modèle en colonne, barres pleine largeur ; aucun défilement horizontal à 375 px.

## 7. Accessibilité
Cartes en `radiogroup`, flèches ; focus sur le premier choix à l'ouverture et retour au bouton à la fermeture ; liste de modèles : flèches, Entrée, Échap, focus rendu à « Changer » ; nom accessible de ligne « Fournisseur X, principal, vérifiée » ; statuts doublés d'une icône ; barres avec valeur en texte ; mouvement réduit respecté ; jetons uniquement ; axe sans violation clair, sombre, 375 px.

## 8. Alternatives écartées
Menu « ... » par ligne (cible fine, actions cachées) contre boutons visibles : boutons visibles, comme la maquette. Enregistrer la clé puis la vérifier (v1) : écarté, une clé fausse ne doit jamais être stockée. Un plafond par fournisseur : écarté par la décision 20 (un seul plafond).

## 9. Questions ouvertes
A5 (règle « données en UE » par fournisseur, attribut de projet) ; taux réel dollars -> euros (B126) ; grille de tarifs hors Anthropic (B52) ; liste des modèles qualifiés (A4).

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-02 | Web : réglages IA (clé BYOK) | Création : une clé Anthropic, « Enregistrer et vérifier » |
| 1.1 | 2026-11-06 | TK-87 | Bloc d'envoi sans nom de fournisseur (B15), échelle typo v2 |
| 1.2 | 2026-11-07 | TK-88 | Rendue sous « Réglages » |
| 2 | 2026-11-07 | TK-98 | Refonte : six fournisseurs, test avant enregistrement, principal/secours, modèle par usage, consommation et plafond. Décisions B121 à B130. Détail : `.workflow/TK-98/00-fiche.md` |

## Correction 1 (TK-98, revue de fidélité à la maquette 24)
Sections en cartes bordées (Fournisseurs, Modèle par usage avec secours en pied, À quoi servent ces clés et Consommation côte à côte dès `lg`) ; « Ajouter un fournisseur » primaire en tête de la carte Fournisseurs ; lignes avec pastilles Principal / Vérifiée / Intermédiaire et actions à droite ; modèles en liste à lignes avec pastille mono ; ajout : « Choisir un fournisseur », cartes radio avec description sur 2 colonnes, champ « Clé <nom> ». Décisions : B140 à B142.
