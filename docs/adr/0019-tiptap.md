---
doc_version: 0.1.0
status: accepted
last_reviewed: 2026-11-08
covers_commit: 0666e7b
---
# 0019 — Éditeur de l'espace Idée : TipTap 3.33.0 (Markdown restreint)

- **Statut** : accepté le 2026-11-08 (TK-89, lot C ; la passation 02 §8 nomme déjà la bibliothèque)
- **Date** : 2026-11-08
- **Décideurs** : developer, designer (ticket TK-89)

## Contexte
Le dossier d'idée se rédige en pages. La seule forme enregistrée et publiée est du Markdown (`idea/<slug>.md`). Le client, qui n'est pas technicien, écrit dans le même éditeur que l'équipe ; le contenu qu'il saisit doit rester inerte partout où il est relu (écran, dépôt, agent).

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. TipTap 3.33.0 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-table`, `-task-list`, `-task-item`) | Basé sur ProseMirror ; schéma fermé, donc pas de nœud pour une balise ou une image non prévue ; entrée et sortie Markdown (`contentType: 'markdown'`, `getMarkdown()`) ; sans style, aux jetons du produit ; MIT ; **aucune faille connue** sur `@tiptap/core` 3.33.0 (OSV, 2026-11-08) | Plusieurs paquets exacts à tenir ensemble ; sérialisation du tableau en colonnes alignées |
| B. Lexical | Léger, bien maintenu | Markdown moins direct, schéma moins fermé ; écartée |
| C. Éditeur Markdown brut (textarea) | Aucune dépendance | Inadapté à un client non technicien |
| D. Éditeur maison sur `contenteditable` | Aucune dépendance | Sélection, IME, accessibilité : coût de maintenance sans bénéfice |

## Décision
Option A, versions exactes **3.33.0**, ajoutées aux dépendances de `apps/web` seulement.
- Jeu restreint : titres 2 et 3, gras, italique, lien, listes, tâches, tableau, citation, séparateur. Ni image, ni code, ni HTML brut.
- Contenu rendu inerte au chargement (`sanitizeIdeaMarkdown`) : balises supprimées (le texte reste), image réduite à son texte, lien dont l'adresse n'est pas http(s) réduit à son texte. Les liens http(s) portent `rel="noopener noreferrer nofollow"`.
- Encadré `> [!note]` : citation dont la première ligne est `[!note]`, désérialisée sans échappement.
- TipTap n'est importé que par `apps/web` ; aucun autre paquet ne l'importe.

## Conséquences
- Une famille de dépendances de production à suivre dans `dependency-audit` ; montée de version groupée par Dependabot.
- Les tests d'éditeur tournent en jsdom, sans navigateur (aller-retour Markdown, contenu hostile).
- Toute autre bibliothèque d'édition passe par un nouvel ADR.
