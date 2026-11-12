---
id: S-spec-item-sheet
titre: Panneau d'édition d'un élément de la spec (SpecItemSheet)
version: 1
---
## 1. Utilisateurs et objectif
Équipe qui écrit (owner, admin, dev, designer ; `SPEC_BATCH_ROLES`). Jamais le client ni le business : aucun bouton, `?new=1` et `?edit=` ignorés. Objectif : créer, modifier ou supprimer un élément de la spec sans connaître git ; en création, l'agent peut préremplir à partir d'une phrase. Ce ticket livre le socle et le formulaire Fonctionnalité (passation 11 §3) ; les autres types arrivent avec leur lot. Maquette 16 fait foi.
## 2. Tâches et parcours
- Principale : ouvrir (« Nouvelle fonctionnalité », « Ajouter à la main » de la carte de l'agent, « Modifier » de la fiche), remplir, « Enregistrer dans la spec » : un `specBatch.submit` d'une opération, toast « F-249 enregistrée dans la spec · commit e4c90a1 », élément sélectionné dans la liste.
- Secondaires : préremplir par l'agent puis « Effacer » ; supprimer (confirmation qui liste ce qui pointe vers l'élément) ; fermer avec confirmation si la saisie est non enregistrée (elle reste en brouillon).
- Entrées : `?new=1`, `?edit=F-001` (S-feature-form). Sorties : panneau fermé, retour du focus sur le bouton d'ouverture.
## 3. Contenu
Sources (contrat 2.11.0) : `spec.item.get` (valeurs, `validated`, `referencedBy`), `ai.prefillItem` (valeurs proposées, aucune écriture), `spec.refs.search` (suggestions des puces), `specBatch.submit`, `specBatch.get`. Champs de la fonctionnalité : Titre*, Priorité* (pastilles), Statut (pastilles, facultatif), Description*, Critères d'acceptation* (éditeur existant), Liens (puces). Détail des valeurs visuelles : DESIGN.md §5.14 et maquette 16.
## 4. États
- Création : encadré « Décrire en une phrase » ; Préremplie : bandeau `role="status"` + filet 3 px et « proposé par l'agent » sur les champs remplis ; Modification : livrable validé, `InlineAlert` attention ; Erreurs : résumé, champs rouges, focus sur le premier.
- Chargement (modification) : squelette du corps, « Enregistrer » désactivé ; erreur de lecture : `FeatureError` avec « Réessayer ». Préremplissage en cours : « Préremplir » `aria-busy`, texte conservé ; refus (clé absente, plafond, verrou) : message sous l'encadré, formulaire intact.
- Droits : sans droit d'écriture le panneau n'existe pas ; un 403 du serveur affiche le message de droits et ne perd pas la saisie.
## 5. Interactions et retours
Focus piégé, Échap ou fond = fermer (confirmation si saisie différente de l'ouverture, « Continuer la saisie » reçoit le focus), ⌘ / Ctrl + Entrée enregistre. Annonces par une seule région `role="status"` : « Préremplie par l'agent… », « N résultats » de l'autocomplétion, état de l'enregistrement. Autocomplétion : anti-rebond 200 ms, 20 résultats au plus, flèches, Entrée ajoute, Échap ferme la liste sans fermer le panneau.
## 6. Responsive
Sous 768 px : plein écran, pied collant, cibles 44 px, puces et pastilles qui passent à la ligne ; aucun défilement horizontal à 375 px.
## 7. Accessibilité
`role="dialog"` `aria-modal`, `h2` nommant le dialogue, `aria-invalid` et `aria-describedby` sur les champs, « * » doublé de `aria-label="obligatoire"`, marqueur agent doublé d'un texte (jamais la couleur seule), ✕ des puces nommés « Retirer R-001 », combobox `aria-activedescendant`, mouvement réduit respecté, axe (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) sans violation dans chaque état.
## 8. Alternatives écartées
- Un formulaire par type sans coque commune : écarté (douze doublons, passation 11 §1).
- Remplir les champs déjà saisis au préremplissage : écarté (perte de saisie) ; seuls les champs vides sont remplis (B329 h).
- Supprimer le brouillon à la fermeture : écarté (S-feature-form §5.5) ; la confirmation s'ajoute sans le retirer.
## 9. Questions ouvertes
B329 (lectures prudentes). Aucune ne bloque.
## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-12 | TK-101 | Création : socle `SpecItemSheet`, 4 modes de la maquette 16, formulaire Fonctionnalité ; généralise S-feature-form. |
| 1.1 | 2026-11-12 | TK-103 | Formulaires Règle (Titre, Type, Énoncé, Exemple, Appliquée par), Rôle (Nom, Description, Permissions avec restriction entre parenthèses) et Parcours (Titre, Acteur, Point de départ, Étapes « libellé · écran », Cas d'erreur, Fonctionnalités), chemins `domain/rules/R-nnn-<slug>.md`, `domain/roles.yaml`, `design/flows/P-<slug>.yaml` ; le designer n'a que le formulaire Parcours (B340). |

## 11. Captures
Générées par `apps/web/e2e/spec-item-sheet.spec.ts` (faux API `support/stub-spec-item.ts`, axe sans violation sur chacune) dans `design/screens/captures/S-spec-item-sheet/` : pour chacun des 4 modes (`create`, `filled`, `edit`, `err`), `<mode>-light.png` (1280 px), `<mode>-dark.png` (1280 px) et `<mode>-mobile.png` (375 px, plein écran) ; plus `delete-confirm-light.png` (modification, confirmation de suppression qui liste `R-004` et `P-annuler`). Galerie : `/dev/ui`, section « 17. Panneau d'édition » (id `dev-ui-spec-item-sheet`), captures `design/screens/captures/S-dev-ui/spec-item-sheet-<mode>-<light|dark>[-mobile].png` générées par `apps/web/e2e/dev-ui.spec.ts`.
