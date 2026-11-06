# Décision · 6 nov. 2026 · Plusieurs fournisseurs d'IA

## Constat
Ne dépendre que d'Anthropic est un risque : panne, tarifs, conditions, exigence de données en UE d'un client.

## Décision
- L'organisation enregistre **une clé par fournisseur** (BYOK) : Anthropic, OpenAI, Google Gemini, Mistral AI, OpenRouter, ou un point d'accès **compatible OpenAI** (adresse + clé : serveur maison, Ollama…).
- Un fournisseur est **principal**, un autre sert de **secours** (bascule si erreur ou limite atteinte, désactivable).
- **Modèle par usage** : Espace Idée, Livrables de la spec, Récapitulatif de la baseline, Découpage en tickets. Seuls les modèles qui passent nos tests par usage (sortie structurée, respect du schéma Zod) sont proposés ; les modèles moins chers portent le badge « économique ».
- **OpenRouter** est marqué « Intermédiaire » : les requêtes y transitent. Il n'est ni proposé ni utilisé en secours sur un projet qui exige des données en UE.
- Consommation ventilée par fournisseur ; **un seul plafond mensuel** tous fournisseurs confondus (alerte à 80 %, suspension des propositions au plafond).
- Rien ne change pour les agents de code : ils tournent en local, avec l'outil et l'abonnement de chacun (cf. decisions-2026-11-06-agents-locaux.md).

## Mise en œuvre
- Bibliothèque : **Vercel AI SDK** (`ai`) avec `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/openai-compatible`, et `@openrouter/ai-sdk-provider`. `generateObject` prend directement les schémas Zod existants.
- Une interface interne `AiProvider` (résolution usage → fournisseur + modèle, bascule de secours, comptage des jetons) : le reste du code n'importe jamais un SDK de fournisseur directement. Complète l'ADR 0015.
- Une suite de tests par usage (jeu de dossiers de référence) qualifie chaque modèle avant de l'ouvrir dans les réglages.
- Fonctions propres à un fournisseur (cache de prompt Anthropic…) : optionnelles, derrière l'interface.

## Écran
Réglages › Fournisseurs d'IA (Lot 13, réservé au propriétaire) : liste des fournisseurs (Principal / Secours, Vérifier, Remplacer la clé, Retirer, Mettre en principal), ajout guidé (choix du fournisseur → clé → requête de test avant enregistrement), Modèle par usage (bouton « Changer » → liste de modèles), interrupteur de secours, consommation par fournisseur et plafond.

## À confirmer
- Liste des modèles qualifiés au lancement et noms affichés.
- Règle exacte « données en UE » par fournisseur (contrats, régions), au-delà d'OpenRouter.
