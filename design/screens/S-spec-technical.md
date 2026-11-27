---
id: S-spec-technical
titre: Spec · Technique (Prêt, Génération, Relecture, Liste · équipe, À revoir, Vue client ; onglets Stack, Environnements, Document)
version: 2
---
> Maquette qui fait foi : `docs/refonte/maquettes/14-Lot8Technique.html` (`pnpm maquette 14`), passations 12 §1 à §4.1, §4.4, §4.5, §7 et §8, 11 §3, 14 §3, 07. Même socle que [S-spec-architecture](S-spec-architecture.md). Onglets API et Exigences, contrat généré et « Valider » : TK-116.

## 1. Utilisateurs et objectif
Équipe : owner, admin et développeur proposent, relisent, modifient et choisissent ; designer lit. Client et business lisent le cahier validé, en mots simples ; le client commente. Objectif : relire les outils retenus (les seuls produits nommés de la spec), trancher les choix ouverts, tenir les environnements (noms de secrets seulement) et le cahier rédigé.

## 2. Tâches et parcours
Prêt → « Proposer le cahier technique » (fenêtre « Proposer avec l'agent ») ou « Écrire à la main » (feuille Choix technique) → Génération → Relecture (onglet devant, groupée par type dès 30) → « Enregistrer N dans la spec » → Liste · équipe. Tâche principale : ouvrir un choix « À trancher », comparer les options, « Choisir <option> ». Secondaires : créer ou modifier un choix ou un environnement, lire le document, commenter (client). Entrée par la barre « 4 Technique » (après l'architecture).

## 3. Contenu
En-tête : fil « Projet / Spec / Technique », h1 « Cahier technique », statut, résumé en ligne entière (compteurs de `spec.head`, choix à trancher de `spec.technical.stack.list`), actions. Stack : `spec.technical.stack.list` (pages de 24, recherche serveur), YAML par `spec.technical.stack.source`. Environnements : `spec.technical.environments`. Document : `spec.document.sections`. Relecture : `proposal.list`. Client : `clientSpace.technical*`, jamais de YAML.

- **Stack** : barre de compte « 24 choix · 2 à trancher » (ou « tous tranchés ») + « Un choix par rôle de l'architecture · les produits ne sont nommés qu'ici » ; sections par couche (Applications, Services et API, Données, Services externes, Hébergement et exploitation) ; 2 cartes par ligne (icône, rôle, choix, « Pour C-… +N » ou « Pour toute l'équipe », « Choisi » ou « À trancher », identifiant). Fiche 480 à 580 px : identifiant, statut, « Modifier », rôle, choix, Fiche · YAML, pourquoi (« En clair » pour le client), encadré « Choix à faire avant la validation du cahier technique. L'agent a comparé trois options ; choisissez-en une ou demandez une autre comparaison. » (nombre réel d'options), « Options comparées » (option choisie « Choisi » ou recommandée « Recommandé »), « ≈ : estimations à vérifier » quand une valeur est estimée, « Choisir <option> » (recommandée en principal), puces Pour les composants, Exigences visées, Décisions.
- **Environnements** : tableau « Environnements » + « Modifier » (menu des environnements), colonnes à pastille, lignes Adresse, Hébergement, Base, Données, Déploiement, lignes libres, Accès ; « Variables et secrets » (« Noms seulement : aucune valeur dans la spec », « Coffre de l'hébergeur ») ; « Intégrations externes » (À trancher, Compte à créer, Configuré, Connecté).
- **Document** : disposition de l'espace Idée, comme l'Architecture ; proposition de section, « Marquer comme validée », section « À rédiger » ; colonne « Agent » (équipe : « Rédiger les sections à rédiger », « Vérifier la cohérence avec la stack et les exigences », « Résumer pour le client », « Ce qui manque encore ») ou « Questions et commentaires » (client : fil, « Poser une question à l'équipe »).

## 4. États
| État | Rendu |
|---|---|
| Prêt | `EmptyState` `terminal`, « L'agent peut proposer le cahier technique », texte de la planche, deux boutons ; en-tête « Prêt » · « L'architecture est validée », sans action |
| Génération | Bandeau `role="status"` (« L'agent rédige le cahier technique : la stack d'abord, puis les opérations de l'API zone par zone et les exigences. Les premières propositions arrivent avant la fin. Vous pouvez quitter la page. » + « Annuler l'attente »), squelette de 440 px |
| Relecture | Bandeau « Mode relecture », filtres « À relire » / « Toutes », groupes Document, Stack, Opérations de l'API, Exigences, Environnements ; rubriques en 12/600 capitales ; texte d'une section proposée en 15 px, sans encadré coloré ; un choix : titre « <rôle> : <option> » ou « <rôle> : À trancher », « pourquoi » sous le titre, « En clair » après les critères |
| Liste · équipe | « Validation de l'équipe · le client lit et commente » ; résumé « … · N choix à trancher avant de valider » |
| Validé | « Validé par l'équipe », « Validé par <prénom> le <date> · version <sha> » |
| À revoir | `InlineAlert` `warning` `role="alert"` « L'architecture a changé depuis la validation (version …). » + changements + « Sont concernés : … », « Voir les changements », « Proposer les mises à jour » ; cartes concernées en contour ambre 2 px |
| Vue client | Bandeau « Lecture seule. … », « Validé par l'équipe · … · lecture seule », « Commenter » ; non validé : `EmptyState` `schedule` « en cours de validation par l'équipe » |
| Vide | « Prêt » seulement sans choix, environnement, opération ni exigence (B767). Onglet sans élément : `EmptyState` avec l'action de l'onglet (équipe qui écrit) ; recherche sans résultat : « Effacer la recherche » |
| Chargement | Squelettes à la taille des cartes et du tableau |
| Erreur | `ErrorNotice` + « Réessayer » ; quota GitHub : « GitHub limite les lectures, réessayez dans N min. » |
| Droits | Designer sans bouton d'écriture ; client et business sans YAML ni « Modifier » ; business sans « Commenter » |

## 5. Interactions et retours
« Choisir <option> » enregistre aussitôt (un commit), annonce « Choix enregistré », le statut passe « Choisi ». Feuilles `SpecItemSheet` (maquette l.427-479) : « Nouveau choix technique » (Rôle*, Composants concernés*, Statut*, Choix retenu, Options comparées*, Critères*, Pourquoi*, Exigences visées) et « Nouvel environnement » (Nom*, Adresse*, Hébergement*, Base*, Données*, Déploiement*, Accès), « Décrire en une phrase », erreurs avec focus, avertissement d'un cahier validé, « Supprimer » en modification. Une valeur de secret est refusée : message sous le champ, sans la valeur recopiée. Les valeurs du tableau comparatif des critères existants sont conservées à la modification. « Accès » vidé à la modification est retiré du fichier (B765) ; un choix sans composant (« Pour toute l'équipe ») se modifie sans en ajouter (B766).

## 6. Responsive
Sous 1280 px la fiche d'un choix s'ouvre en panneau (comme l'Architecture) ; sous 768 px : une carte par ligne, liste puis fiche « ← Liste », tableaux en défilement interne focusable, panneaux Variables et Intégrations l'un sous l'autre, sections du document au-dessus du texte, feuille en plein écran, commandes de 44 px, aucun défilement horizontal de page.

## 7. Accessibilité
Onglets en `nav` avec `aria-current` ; cartes en boutons `aria-pressed` au nom complet (rôle, choix, statut) ; couche = titre de section ; tableaux avec légende et `th scope` ; couleur toujours doublée d'un libellé (statut, pastille d'environnement, « à trancher ») ; Échap et retour du focus (feuille, dialogue, menu) ; une seule région `role="status"` pour les annonces ; texte brut pour toute sortie du modèle ; axe sans violation en clair et en sombre.

## 8. Alternatives écartées
- Afficher les onglets API et Exigences avec « Bientôt » : boutons morts ; seuls Stack, Environnements et Document sont livrés (TK-116 ajoutera les autres).
- « Modifier » dans chaque colonne du tableau des environnements : écart à la planche ; retenu : le seul bouton de la légende, avec un menu des environnements.
- Montrer au client le cahier non validé : écarté, même règle que l'Architecture (B725).
- Champ de recherche permanent sur la Stack : absent de la planche ; affiché seulement au-delà d'une page (24) ou quand une recherche est active (B728).

## 9. Questions ouvertes
Aucune bloquante (B718 à B737 décidées en autonomie). À confirmer après coup : bouton « Valider » (TK-116), glisser et ajout de section du Document.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-27 | TK-115 | Création : états, onglets Stack (Choisir), Environnements (noms seulement), Document, feuilles Choix technique et Environnement, vue client ; `StackLayer`, `StackChoiceCard`, `ComparisonTable`, `EnvironmentTable`, `SpecRowsPanel` ajoutés à `packages/ui` (DESIGN.md §5.26). |

## États comparés à la maquette
Clair, sombre et 375 px : Liste · équipe, Stack avec la fiche d'un choix à trancher (1440, clair puis sombre) ; Stack et fiche à 375 px ; Environnements en vue client ; Relecture groupée, section proposée ouverte ; Prêt (sombre).
| 2 | 2026-11-27 | TK-115 (lot C) | Réalisation : fiche d'un choix (`StackFicheTitle`), document partagé (`SpecDocumentTab`) avec rédaction proposée sur place, vue client « Questions et commentaires » (absente pour le business), menu des environnements ; agent fermé : « Revalidez l'architecture pour relancer l'agent. » (B753 à B762). |
| 3 | 2026-11-27 | TK-115 (correction 1) | Relecture d'un choix (titre, « pourquoi », « En clair »), rubriques en capitales, « Accès » effaçable, choix d'équipe modifiable, pastilles et tableau comparatif ajustés à la maquette (B763 à B767). |
