# Refonte UI · Lot 14 · Sécurité : passation à l'agent dev

> Validé par Brice le 06/11/2026 : la sécurité devient le 5ᵉ livrable de la spec. Le client n'en valide pas le détail : il lit un résumé, repris dans la baseline 0 qu'il valide.
> Maquette : canevas « Koklo — maquettes » (https://claude.ai/artifact/F6nuypdhrWp1Y7x8QwRiFm), planche **Lot 14 · Sécurité**. Sélecteurs : Relecture, Liste · équipe, À revoir, Vue client ; Démo / Volume réel.
> À lire avant : `principe-proposer-avec-agent.md`, `principe-creer-modifier.md`, `lot-10-qualite-passation.md` (même structure), `lot-11-baseline-passation.md`.

## 0. Ce qui change partout

- **La spec compte 7 livrables** : Fonctionnel 1, Données 2, Architecture 3, Technique 4, **Sécurité 5** (icône `shield`), Design 6, Qualité 7. Compteur de la barre latérale en « x/7 ». Sécurité est « Disponible après le technique ».
- Planches mises à jour : lots 1, 3, 4, 5 (Fonctionnel et principe agent), 6 à 13, Studio d'écran.
- **Lot 11 · Baseline** : carte Sécurité dans « Les 7 livrables » (validée par l'équipe, « résumé client joint ») ; section « Vos données et leur sécurité » dans le récapitulatif client ; deux contrôles bloquants : « Aucune menace de gravité élevée sans parade », « Chaque donnée personnelle est classée ».
- **Lot 12 · Tickets** : deux contrôles CI de plus sur la PR : « Sécurité · secrets, dépendances, analyse statique » et « Scénarios d'abus · F-xxx ». Les tickets « sensibles » (connexion, paiement, export, droits) vont à un humain ou demandent deux relectures.
- **Lot 13 · Réglages** : section **Journal d'audit** (propriétaire), voir §3.

## 1. Page du livrable

Route `/projects/[id]/spec/security`. En-tête : statut, résumé (« 18 menaces · 17 traitées · 8 données classées · 20 scénarios d'abus · ASVS niveau 2 »), actions **Proposer avec l'agent** (bouton commun), **Nouvelle menace** (`SpecItemSheet`, formulaire `threat`), **Valider** (désactivé tant qu'il reste une menace élevée sans parade ou une donnée non classée ; la raison est dans le résumé).

Onglets : Relecture (en relecture), **Menaces**, **Données sensibles**, **Droits**, **Exigences**, **Résumé client**, **Document**. Le client ne voit que **Résumé**.

### 1.1 Menaces
- Filtres : Toutes, Gravité élevée, À traiter, Vérifiées par la CI. Ligne de compte + pastille « 1 à traiter ».
- Groupes repliables par **surface exposée** (fonctionnalité, ou « API, secrets et intégrations ») ; ligne : id `SEC-Txx`, titre, gravité (Élevée en rouge, Moyenne, Faible), état (Traitée, À traiter, Proposée, À revoir).
- **Fiche** (panneau de droite) : catégorie (Usurpation, Accès non autorisé, Fuite de données, Altération, Abus, Conformité), gravité, « Ce qui peut arriver », **Parades** (une par ligne, icône `shield`), liens (fonctionnalité, opérations, tables, rôles, exigences), vérification. Vue **Scénario d'abus** : Gherkin généré (`@SEC-Txx @F-xxx @abus`).
- Menace élevée sans parade : encadré ambre « bloque la validation » + **Proposer une parade** (agent).

### 1.2 Données sensibles
- Bandeau : hébergement, sous-traitants, transferts hors UE ; **Classer une donnée** (`SpecItemSheet`, formulaire `sensitive`), **Registre RGPD** (export Markdown).
- Tableau : donnée, champ (`table.champ`), catégorie (Personnelle, Contact, **Santé ou sensible**, Secret, Technique), conservation, qui y accède, protection. Ligne non décidée surlignée en ambre avec **Décider**.
- Règles : un nouveau champ non classé bloque la validation ; la CI refuse un journal contenant un champ Personnelle ou Contact en clair.

### 1.3 Droits
- Matrice action × rôle (depuis les rôles du Fonctionnel) : `check` vert, `remove`, ou restriction en ambre avec le texte (« Les siens », « Avec second facteur »).
- **Règles de propriété** et compteur **Scénarios d'abus générés** : un par case « non » ou restreinte, joué en CI (403 ou 404 attendu).

### 1.4 Exigences
- Niveau **OWASP ASVS** (1, 2 recommandé dès qu'il y a des données personnelles, 3).
- Tableau par chapitre (Authentification, Sessions, Contrôle d'accès, Validation et encodage, Cryptographie et secrets, Journalisation et alertes, Protection des données, Configuration et dépendances, API) : barre de couverture, « où c'est répondu », état.
- **Secrets et dépendances** (gestionnaire de secrets, rotation, mises à jour, accès production : aucun agent) et **Une pull request ne fusionne pas si…** (secret, dépendance critique, faille haute en analyse statique, scénario d'abus en échec, opération sans permission ou champ classé en clair dans un journal).

### 1.5 Résumé client
- 7 cartes en mots simples, sans identifiant : où sont les données, ce qui est protégé, qui voit quoi, connexion, conservation, ce qui est vérifié, incident (24 h pour le client, 72 h pour la CNIL).
- Encadré **Ce que nous attendons de vous** : contact en cas d'incident (bouton côté client).
- Côté équipe : « C'est ce que lit le client… » + **Mettre à jour avec l'agent** (proposition en pointillés, Accepter / Rejeter). Côté client : **Poser une question** ouvre un champ.

### 1.6 Document
`SpecDocument` (même modèle que l'espace Idée et la Qualité), fichiers `security/dossier/NN-*.md` : Objet et périmètre, Données personnelles et RGPD, Authentification et sessions, Contrôle d'accès, Menaces et parades, Secrets et dépendances, Réponse à un incident (+ section proposée « Sauvegardes et restauration »).

### 1.7 États
- **Relecture** : propositions groupées (menaces, données, droits, document), Accepter / Modifier / Rejeter, enregistrement en un lot.
- **À revoir** : bandeau quand un livrable source change (ex. fournisseur SMS dans le Technique) avec les éléments concernés et **Proposer les mises à jour**.

## 2. Fichiers de spec

```
security/threats/SEC-T01.yaml   # menace : surface, catégorie, gravité, risque, parades, vérification, liens
security/data.yaml              # classification des champs du modèle
security/rights.yaml            # matrice (généré depuis domain/roles.yaml + restrictions)
security/asvs.yaml              # niveau et réponses par exigence
security/summary.md             # résumé client
security/dossier/NN-*.md        # document
```
Les scénarios d'abus sont générés dans `quality/scenarios/abuse/` et comptent dans la couverture du lot 10.

## 3. Journal d'audit (Lot 13)
Réglages › Organisation › **Journal d'audit** (propriétaire) : filtres Tout, Accès et rôles, Clés et secrets, Données, Agents ; une ligne par action (icône, date, action, détail, auteur) ; **Exporter** (CSV). Non modifiable, gardé un an. Événements : fournisseur d'IA ajouté/retiré, rôle modifié, invitation, baseline soumise/posée, export du fichier clients, poste d'agent connecté/révoqué, secret renouvelé.

## 4. Contrat

| Procédure | Usage |
|---|---|
| `security.threat.list/create/update` | Menaces |
| `security.data.list/classify`, `security.registry.export` | Données sensibles, registre RGPD |
| `security.rights.get` (dérivé des rôles) | Matrice |
| `security.asvs.setLevel`, `security.asvs.report` | Exigences |
| `security.summary.get/propose/accept` | Résumé client |
| `security.validate` (refus si menace élevée sans parade ou donnée non classée) | Validation |
| `audit.list({ orgId, kind, cursor })`, `audit.export` | Journal d'audit |
| agent : `security.propose({ mode: 'threats' \| 'classify' \| 'asvs' \| 'summary' })` | clé d'IA de l'organisation |

## 5. Critères d'acceptation
- [ ] 7 livrables partout (barre latérale, compteurs, baseline, vue d'ensemble, projets).
- [ ] Menaces avec fiche, scénario d'abus généré, blocage d'une menace élevée sans parade.
- [ ] Classification des données, registre RGPD, blocage d'un champ non classé.
- [ ] Matrice des droits → scénarios d'abus en CI ; gates sécurité sur les PR.
- [ ] Le client ne voit que le résumé ; le résumé apparaît dans le récapitulatif de la baseline.
- [ ] Journal d'audit non modifiable.
- [ ] Captures : 4 états × onglets, fiche, formulaires, clair, sombre, 375 px.

## 6. Points à confirmer
- Niveau ASVS par défaut selon le type de projet.
- Durées de conservation par défaut proposées par l'agent (à faire relire par un juriste).
- Outils de la CI (Semgrep, Gitleaks, OSV-Scanner) : choix du cahier technique, à confirmer.

## 7. Tickets
```
- [ ] **[TK-?]** Lot 14a · Spec à 7 livrables : barre latérale, compteurs, ordre, dépendances « après le technique ». Réf. design/refonte/lot-14-securite-passation.md §0.
- [ ] **[TK-?]** Lot 14b · Livrable Sécurité : menaces, données sensibles, droits, exigences ASVS, document, relecture et états. Réf. §1, §2, §4. — dépend de 14a
- [ ] **[TK-?]** Lot 14c · Résumé client + intégration baseline (récap, contrôles) ; gates sécurité et scénarios d'abus en CI ; journal d'audit. Réf. §1.5, §0, §3. — dépend de 14b, lots 11, 12, 13
```
