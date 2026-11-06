# Refonte UI · Lot 15 · Recette et mises en ligne : passation à l'agent dev

> Validé par Brice le 06/11/2026 : Koklo lit les déploiements de GitHub pour outiller la recette (équipe et client), produire un procès-verbal signé, et calculer les indicateurs de livraison.
> **Hors périmètre : tout l'aspect financier** (jalons, montants, facturation). Koklo se concentre sur la livraison du produit ; il doit servir aussi bien une agence et son client qu'une équipe interne et son commanditaire métier. « Client » désigne celui qui demande et valide le produit, externe ou interne.
> Maquette : canevas « Koklo — maquettes » (https://claude.ai/artifact/F6nuypdhrWp1Y7x8QwRiFm), planche **Lot 15 · Recette**. Sélecteurs : Équipe · campagne, Vue client, PV signé ; Démo / Volume réel.
> À lire avant : `lot-12-tickets-passation.md`, `lot-10-qualite-passation.md` (scénarios, section « Recette avec le client »), `lot-11-baseline-passation.md`, `decisions-2026-11-06-agents-locaux.md`.

## 0. Principes

- **Koklo ne déploie rien.** Il lit l'API GitHub (environnements, déploiements et leurs statuts, posés par GitHub Actions, Vercel, Netlify…). La mise en production se fait dans GitHub, avec ses règles d'approbation. Koklo affiche l'approbation en attente et renvoie vers GitHub.
- La recette porte sur **une version précise** (tag + commit) d'un environnement.
- **Seul le client signe** le procès-verbal, comme la baseline.
- Un retour est soit une **anomalie** (ticket), soit une **demande de changement** (touche la spec, impact évalué à part, ne bloque pas la recette).

## 1. Navigation

Entrée **Recette** (`rocket_launch`) après Tickets dans la barre latérale, phase Itérations ; badge : id de campagne (équipe), « À vous » (client, ambre), « Signée » (vert). Ajoutée aux planches 12, 13 et 15. Route `/projects/[id]/releases`.

## 2. Onglets (équipe)

### 2.1 Environnements
- Une carte par environnement (**Production**, **Recette**) : adresse, statut, version et commit, date et auteur du déploiement, contenu (tickets, fonctionnalités), données (« jeux d'exemple réinitialisés chaque nuit »), approbation requise. Production : encadré « attend la signature du PV » puis « approbation en attente dans GitHub » (bouton **Approuver dans GitHub** = lien).
- **Aperçus des pull requests** : une ligne par PR avec aperçu (clé du ticket, titre, adresse, fournisseur, ancienneté), état Prêt / Échec / En cours ; **Essayer**, **Journaux GitHub**, **Suivre**.
- **En recette, pas encore en production** : tickets de l'écart, avec leur fonctionnalité.
- **Derniers déploiements** : quand, environnement, version + commit, par, statut.

### 2.2 Campagne de recette
- En-tête : campagne (`R-n`), version, date d'ouverture, nombre de scénarios (choisis depuis les tickets de la version, livrable Qualité), testeurs ; **Ouvrir la recette** ; barre passent / échouent / à jouer.
- Filtres : Tous, À jouer, Échecs, Marie (client). Groupes par **parcours** (P-xx) ; ligne : scénario, liens, testeur (client en ambre), résultat, ou boutons **Passe / Échoue** pour le testeur concerné. Échoue → `SpecItemSheet` formulaire `anomaly` prérempli (version, scénario), bouton « Envoyer le retour ».
- Panneau **Retours** : anomalies (gravité Bloquante / Majeure / Mineure, ticket créé, état) et demandes de changement (« hors baseline : impact évalué avant décision »). **Signaler** (équipe et client).
- « Le procès-verbal se signe quand » : tous les scénarios joués, aucune anomalie bloquante ouverte ; les demandes de changement ne bloquent pas.

### 2.3 Notes de version
Liste des versions (Brouillon / Publiée). Note en mots simples : Ce qui est nouveau, Ce qui est corrigé, Ce qui change pour vous. Brouillon rédigé par l'agent depuis les tickets fusionnés depuis la version précédente ; **Publier au client** (e-mail au client).

### 2.4 Procès-verbal
Version + commit, environnement, campagne, référence (baseline et CR acceptées) ; Résultats ; Réserves ; **Décision du client** (sans réserve, avec réserves, refusée). Équipe : **Envoyer pour signature**, aperçu PDF. Client : **Signer** (actif quand tous ses scénarios sont joués et une décision choisie). Après signature : bandeau vert, export PDF, tag `recette-vX.Y.Z` posé dans GitHub, production proposée à l'approbation dans GitHub.

### 2.5 Indicateurs (équipe)
Mises en production, délai fusion → production (médiane), échecs au 1er passage, anomalies en production, sur 30 jours ; tableau par version. Calculés sans saisie (GitHub + recette).

## 3. Vue client
Onglets **Campagne** (filtre « À moi » par défaut, sans identifiants techniques), **Notes de version** (publiées seulement), **Procès-verbal**. En-tête « À vous de jouer » + **Ouvrir la recette**. Les retours affichent « L'équipe corrige » / « L'équipe évalue l'impact » au lieu des tickets.

## 4. Ailleurs
- **Lot 12** : contrôle « Aperçu déployé » (adresse, fournisseur, ancienneté) dans l'onglet Pull request du ticket ; dans la vue client, « Prête à essayer » renvoie vers la recette.
- **Lot 10** : la section « Recette avec le client » du plan de test décrit la campagne et le PV.
- **Lot 13** : le journal d'audit trace l'envoi et la signature du PV et la publication des notes.

## 5. Contrat

| Procédure | Usage |
|---|---|
| `deploy.environments({ projectId })`, `deploy.list({ projectId, env?, cursor })`, `deploy.previews({ projectId })` | lecture GitHub (webhooks `deployment`, `deployment_status`) |
| `release.gap({ from: 'production', to: 'recette' })` | écart en tickets |
| `campaign.create({ version, scenarioIds, testers })`, `campaign.get`, `campaign.result({ scenarioId, result })` | campagne |
| `feedback.create({ kind: 'anomaly' \| 'change', … })` | retours ; une anomalie crée un ticket, un changement crée une CR |
| `releaseNotes.propose({ version })`, `releaseNotes.publish` | notes (clé d'IA de l'organisation) |
| `pv.send`, `pv.sign({ decision })` (client), `pv.export` | procès-verbal |
| `metrics.delivery({ projectId, days })` | indicateurs |

## 6. Critères d'acceptation
- [ ] Aucune action de déploiement depuis Koklo ; tout vient de l'API GitHub.
- [ ] Campagne : résultats par testeur, Échoue ouvre un retour prérempli, conditions de signature.
- [ ] PV signé par le client seul, lié à un commit, tag posé.
- [ ] Aucune donnée financière (montant, jalon, facture) nulle part.
- [ ] Notes de version sans identifiant technique côté client.
- [ ] Indicateurs calculés sans saisie.
- [ ] Captures : 3 états × onglets, panneau de retour, clair, sombre, 375 px.

## 7. Points à confirmer
- Délai de signature et relance automatique du client.
- Hébergeurs pris en charge au lancement (GitHub Actions, Vercel, Netlify).

## 8. Tickets
```
- [ ] **[TK-?]** Lot 15a · Lecture GitHub : environnements, déploiements, aperçus de PR, écart recette/production ; onglet Environnements ; contrôle « Aperçu déployé » dans le ticket. Réf. design/refonte/lot-15-recette-passation.md §2.1, §4, §5.
- [ ] **[TK-?]** Lot 15b · Campagne de recette, retours (anomalie / changement), vue client. Réf. §2.2, §3. — dépend de 15a et du lot 10
- [ ] **[TK-?]** Lot 15c · Notes de version, procès-verbal et signature, indicateurs. Réf. §2.3 à §2.5. — dépend de 15b
```
