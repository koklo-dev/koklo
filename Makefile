# Makefile — points d'entrée du projet.
#
# Les cibles fournies par shipyard (session Claude+Happy dans tmux, boucle de
# livraison, lint/test/build lus dans .project/state.json, doctor) vivent dans
# .project/make/shipyard.mk, régénéré à chaque mise à jour du framework.
#
#   make            → liste les cibles disponibles
#   make session    → session Claude + Happy dans tmux (Ctrl-b puis d = détacher)
#
# Ajoutez vos propres cibles sous l'include : un commentaire `## …` en fin de
# ligne les fait apparaître dans `make help`.

-include .project/make/shipyard.mk
