---
title: Relire et compléter le cahier technique
audience: functional
doc_version: 0.2.0
status: draft
last_reviewed: 2026-11-27
covers_release: unreleased
sources: []
covers_commit: 9f186946
---
# Relire et compléter le cahier technique

**Pour qui** : les **Propriétaires**, **Administrateurs** et **Développeurs**. Le **Designer** lit l'écran sans rien modifier ; le **Client** et le **Business** ont une vue en lecture seule (plus bas).
**Avant de commencer** : l'architecture est validée (ou le livrable a été ouvert) et contient au moins un composant.
**Résultat** : les choix techniques, les environnements et le document acceptés sont écrits dans la spec ; rien n'est écrit avant votre clic.

## Étapes

1. Ouvrez le projet, puis **Spec**, puis **Technique** : la page **Cahier technique** s'ouvre. S'il est vide, cliquez **Proposer le cahier technique**, ou **Écrire à la main**.
2. Dans la fenêtre de l'agent, choisissez **Compléter le cahier**, **Comparer les options d'un choix** (s'il reste un choix à trancher), **Rendre les exigences mesurables** (s'il existe des exigences) ou **Tout reproposer**, puis cliquez **Lancer**. Les premières propositions arrivent avant la fin ; vous pouvez quitter la page.
3. Relisez les propositions, groupées en **Document**, **Stack**, **Opérations de l'API**, **Exigences** et **Environnements**. Pour chacune : **Accepter**, **Rejeter**, ou **Demander une modification à l'agent**. **Remettre à relire** annule une décision. Les valeurs précédées de « ≈ » sont des estimations à vérifier.

   ![Relecture groupée des propositions, thème clair](../../../design/screens/captures/S-spec-technical/review-grouped-light.png)

4. Cliquez **Enregistrer N dans la spec**.
5. Onglet **Stack** : ouvrez un choix **À trancher**, comparez les **Options comparées**, puis cliquez **Choisir** suivi du nom de l'option. Le choix est enregistré aussitôt (« Choix enregistré »).

   ![Choix à trancher et sa fiche, thème clair](../../../design/screens/captures/S-spec-technical/list-stack-fiche-light.png)

6. Pour compléter à la main : **Nouveau choix** (ou **Modifier** dans une fiche) et **Nouvel environnement** (ou **Modifier** au-dessus du tableau, puis le nom de l'environnement). À la création, **Décrire en une phrase, l'agent remplit le formulaire** puis **Préremplir** vous fait gagner la saisie. Terminez par **Enregistrer dans la spec** ou **Enregistrer les modifications**.

   ![Environnements, variables et intégrations, thème clair](../../../design/screens/captures/S-spec-technical/list-environments-light.png)

7. **Variables et secrets** : la spec ne garde que les noms et leur usage, jamais les valeurs. Les valeurs restent dans le coffre de votre hébergeur.
8. Onglet **Document** : lisez les sections, **Accepter** ou **Rejeter** une rédaction proposée, **Marquer comme validée**, ou **Rédiger avec l'agent** sur une section « Section à rédiger ».

## Après une validation

Si l'architecture change ensuite, un bandeau « L'architecture a changé depuis la validation » liste les changements. **Voir les changements** ouvre l'architecture ; **Proposer les mises à jour** relance l'agent. Les choix concernés sont entourés en ambre.

## Client et Business

Une fois le cahier **Validé par l'équipe**, les onglets **Stack**, **Environnements** et **Document** se lisent sans modification. Le **Client** peut cliquer **Commenter**, ou **Poser une question à l'équipe** sous une section du document. Avant la validation, l'écran affiche « Le cahier technique est en cours de validation par l'équipe ».

## Vérifier que ça a marché
Les éléments acceptés apparaissent dans leur onglet et le résumé de l'en-tête les compte (« … choix · … opérations · … exigences · … environnements »). Les opérations de l'API et les exigences sont comptées ici mais n'ont pas encore d'onglet à elles.

## Si quelque chose ne va pas
| Message | Cause | Que faire |
|---------|-------|-----------|
| Une valeur de secret ne peut pas entrer dans la spec : gardez seulement le nom de la variable. | Un texte contient une clé, un mot de passe ou un jeton | Retirez la valeur. Le contrôle ne reconnaît pas tout : relisez vous-même avant d'enregistrer |
| Le technique s'ouvre quand l'architecture est validée : validez-la, ou ouvrez le livrable. | L'architecture n'est pas validée | Validez l'architecture, ou demandez à un propriétaire ou un administrateur d'ouvrir le livrable |
| L'architecture est vide : enregistrez au moins un composant avant de proposer le cahier technique. | Aucun composant enregistré | Complétez l'architecture |
| Revalidez l'architecture pour relancer l'agent. | L'architecture a changé et n'est pas revalidée | Revalidez-la |
| Un choix de ce rôle existe déjà. / Un environnement de ce nom existe déjà. | Le nom est pris | Modifiez l'élément existant |
| Impossible de charger le cahier technique | Problème de lecture | Cliquez **Réessayer** |
