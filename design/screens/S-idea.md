---
id: S-idea
titre: Dossier d'idée
version: 1
---
## 1. Utilisateurs et objectif
Équipe (owner, admin, dev, designer) et client lié au projet rédigent ensemble le dossier d'idée avant le cadrage ; le business le lit. Route `/projects/[projectId]/idea`, depuis la barre du projet. Maquette `docs/refonte/maquettes/06-Lot2Idee.html` (fait foi), passation 02 §1 à §7, §10, §11.
## 2. Tâches et parcours
Principale : écrire une page (éditeur Markdown restreint, enregistrement auto). Secondaires : ajouter, renommer, réordonner, supprimer et restaurer une page ; marquer stable ; enregistrer une version (équipe). Sorties : aucune au lot 2a (panneau de l'agent, Synthèse, passage au cadrage : TK-90 et TK-91, éléments non affichés).
## 3. Contenu
Pages ordonnées sans contenu (`idea.list`), page courante (`idea.get`), présence (`idea.presence`), publication (`idea.publish`, suivi `specBatch.get`). Numéro affiché = position courante, jamais stocké.
## 4. États
Chargement (squelettes), dossier vide (`EmptyState` « Aucune idée encore », « Commencer le dossier »), erreur de chargement, introuvable et 401, enregistrement (« Enregistrement… », « Brouillon enregistré », « Hors ligne : modifications gardées localement »), conflit de version, publication (confirmation, succès, échec), dépôt indisponible (raison à la place du bouton), vue client (bouton de publication absent), business (lecture seule).
## 5. Interactions et retours
Titre éditable en place (Entrée valide) ; glisser-déposer, clavier et Alt + flèches annoncés ; suppression confirmée en ligne (focus sur « Garder ») puis « Page supprimée. » + Annuler ; corbeille repliée « Corbeille (N) » ; ajout place le focus dans le titre.
## 6. Responsive
Sous 1024 px : arborescence en menu déroulant au-dessus du document, Monter/Descendre, pas de glisser tactile. Sous 768 px : en-tête sur deux lignes, boutons pleine largeur, cibles de 44 px. 375 px sans défilement horizontal.
## 7. Accessibilité
`nav` « Pages du dossier » (`ol`), `article`, h1 « Dossier d'idée », h2 titre de page ; poignée = `button` nommé « Déplacer 05 · Périmètre » ; statuts icône + libellé + légende ; `aria-live` polite pour déplacements et enregistrements ; mouvement réduit respecté ; axe sans violation clair et sombre.
## 8. Alternatives écartées
Colonne d'agent vide réservée : écartée (zone morte, pas de bouton mort). Édition simultanée temps réel : reportée (passation 13). Choix par bloc au conflit : reporté, version entière retenue (B188).
## 9. Questions ouvertes
B184 à B197 dans `docs/refonte/questions.md` (décidées en autonomie).
## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-08 | TK-89 | Création d'après la passation 02 et la maquette 06, sans les zones d'agent, de Synthèse, de jauge ni de passage au cadrage (hors lot). |
