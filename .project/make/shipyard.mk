# ─────────────────────────────────────────────────────────────────────────────
# shipyard.mk — cibles make du projet, fournies par shipyard.
#
# FICHIER GÉNÉRÉ : il est réécrit à chaque `make install` du framework et à
# chaque `/upgrade-project`. Ne l'éditez pas — ajoutez vos propres cibles dans
# le `Makefile` à la racine, elles apparaîtront dans `make help`.
#
# Tout ce qui dépend du projet (lint, test, build…) est lu à l'exécution dans
# .project/state.json → .stack_profile.commands, donc ces cibles suivent la
# stack sans être régénérées.
# ─────────────────────────────────────────────────────────────────────────────

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

REPO_ROOT     := $(shell git rev-parse --show-toplevel 2>/dev/null || pwd)
REPO_NAME     := $(notdir $(REPO_ROOT))
STATE         := $(REPO_ROOT)/.project/state.json
LOOP_DIR      := $(REPO_ROOT)/.project/loop
LOOP_LOG      := $(LOOP_DIR)/loop.log
SHIPYARD_HOME ?= $(HOME)/.claude/shipyard

# Noms de sessions tmux — surchargeables : make session SESSION=perso
SESSION       ?= claude-$(REPO_NAME)
LOOP_SESSION  ?= shipyard-loop-$(REPO_NAME)
PILOT_SESSION ?= shipyard-pilot-$(REPO_NAME)

# make session YOLO=1 → démarre sans confirmation de permissions
YOLO ?= 0

.PHONY: help session attach sessions session-kill pilot \
        daemon daemon-status daemon-stop \
        loop loop-attach loop-status loop-logs loop-stop loop-start loop-restart \
        deps lint format test e2e build dev audit \
        status doctor

# Pilotage de la boucle : systemd (système ou --user) ou tmux, détecté à l'exécution.
LOOP_SVC := $(REPO_ROOT)/.project/make/loop-service.sh

# ── Aide ─────────────────────────────────────────────────────────────────────

help: ## Affiche cette aide
	@echo "cibles make de $(REPO_NAME) :"
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | sort -u \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "Session : make session [YOLO=1] [SESSION=nom]   détacher : Ctrl-b puis d"
	@echo "Boucle  : make loop-status / loop-logs / loop-stop / loop-restart"

# ── Sessions Claude pilotables au téléphone (Happy) dans tmux ────────────────
#
# tmux garde la session vivante quand le terminal ou le SSH meurt ; Happy la
# rend pilotable depuis le mobile. Les deux sont complémentaires : Happy sans
# tmux meurt avec le terminal, tmux sans Happy n'est pas joignable du dehors.

define require_tmux
	@command -v tmux >/dev/null 2>&1 || { \
	  echo "❌ tmux manquant — installez-le : sudo apt install -y tmux (ou brew install tmux)"; \
	  exit 1; }
endef

session: ## Ouvre (ou rattache) une session Claude+Happy dans tmux — Ctrl-b d pour détacher
	$(require_tmux)
	@yolo="$(YOLO)"; \
	if [ "$$yolo" = 1 ] && [ "$$(id -u)" = 0 ]; then \
	  echo "⚠️  YOLO=1 ignoré : Claude Code refuse --dangerously-skip-permissions sous root,"; \
	  echo "    et la session mourrait au premier message venu du mobile (docs/REMOTE.md §2)."; \
	  yolo=0; \
	fi; \
	if command -v happy >/dev/null 2>&1; then \
	  if [ "$$yolo" = 1 ]; then agent="happy --yolo"; \
	  else agent="happy --permission-mode default"; fi; \
	else \
	  echo "ℹ️  Happy absent (npm i -g happy) — session Claude nue, sans pilotage mobile"; \
	  if [ "$$yolo" = 1 ]; then agent="claude --dangerously-skip-permissions"; else agent="claude"; fi; \
	fi; \
	echo "→ session tmux '$(SESSION)' : $$agent"; \
	echo "  détacher : Ctrl-b puis d   ·   revenir : make attach"; \
	if [ -n "$$TMUX" ]; then \
	  tmux new-session -d -A -s "$(SESSION)" -c "$(REPO_ROOT)" "$$agent" \
	    && tmux switch-client -t "$(SESSION)"; \
	else \
	  tmux new-session -A -s "$(SESSION)" -c "$(REPO_ROOT)" "$$agent"; \
	fi

attach: ## Rattache la session Claude existante
	$(require_tmux)
	@tmux has-session -t "$(SESSION)" 2>/dev/null || { \
	  echo "❌ aucune session '$(SESSION)' — lancez : make session"; exit 1; }
	@if [ -n "$$TMUX" ]; then tmux switch-client -t "$(SESSION)"; \
	else tmux attach-session -t "$(SESSION)"; fi

sessions: ## Liste les sessions tmux et les sessions Happy connues
	@echo "── tmux"
	@tmux list-sessions 2>/dev/null || echo "  (aucune session tmux)"
	@echo "── happy"
	@if command -v happy >/dev/null 2>&1; then happy daemon list 2>/dev/null || true; \
	else echo "  (happy absent)"; fi

session-kill: ## Tue la session Claude tmux (SESSION=nom pour cibler)
	@tmux kill-session -t "$(SESSION)" 2>/dev/null \
	  && echo "✅ session '$(SESSION)' tuée" \
	  || echo "ℹ️  aucune session '$(SESSION)'"

pilot: ## Session de diagnostic de la boucle (happy-pilot.sh) dans tmux
	$(require_tmux)
	@test -f "$(LOOP_DIR)/happy-pilot.sh" || { \
	  echo "❌ $(LOOP_DIR)/happy-pilot.sh absent — lancez /deliver une fois pour installer la boucle"; \
	  exit 1; }
	@tmux new-session -A -s "$(PILOT_SESSION)" -c "$(REPO_ROOT)" "bash .project/loop/happy-pilot.sh"

daemon: ## Démarre le démon Happy (sessions joignables depuis le mobile)
	@happy daemon start

daemon-status: ## État du démon Happy
	@happy daemon status

daemon-stop: ## Arrête le démon Happy (les sessions en cours survivent)
	@happy daemon stop

# ── Boucle de livraison autonome ─────────────────────────────────────────────

loop: ## Lance la boucle de livraison en tmux détaché (survit à la fermeture du terminal)
	$(require_tmux)
	@test -f "$(LOOP_DIR)/agent-loop.sh" || { \
	  echo "❌ $(LOOP_DIR)/agent-loop.sh absent — lancez /deliver dans Claude pour l'installer"; \
	  exit 1; }
	@if tmux has-session -t "$(LOOP_SESSION)" 2>/dev/null; then \
	  echo "ℹ️  la boucle tourne déjà — make loop-attach"; \
	else \
	  tmux new-session -d -s "$(LOOP_SESSION)" -c "$(REPO_ROOT)" \
	    "bash .project/loop/agent-loop.sh 2>&1 | tee -a '$(LOOP_LOG)'" \
	  && echo "✅ boucle démarrée dans tmux '$(LOOP_SESSION)' — logs : make loop-logs"; \
	fi

loop-attach: ## Rattache la session tmux de la boucle (Ctrl-b d pour sortir)
	@tmux has-session -t "$(LOOP_SESSION)" 2>/dev/null || { \
	  echo "❌ la boucle ne tourne pas dans tmux — make loop"; exit 1; }
	@if [ -n "$$TMUX" ]; then tmux switch-client -t "$(LOOP_SESSION)"; \
	else tmux attach-session -t "$(LOOP_SESSION)"; fi

loop-status: ## État de la boucle : bloc .loop, unité systemd (service + timer), session tmux
	@SHIPYARD_LOOP_SESSION="$(LOOP_SESSION)" SHIPYARD_LOOP_LOG="$(LOOP_LOG)" bash "$(LOOP_SVC)" status

loop-logs: ## Suit les logs de la boucle (journalctl de l'unité, sinon fichier tmux)
	@SHIPYARD_LOOP_SESSION="$(LOOP_SESSION)" SHIPYARD_LOOP_LOG="$(LOOP_LOG)" bash "$(LOOP_SVC)" logs

loop-stop: ## Arrête la boucle H24 : service arrêté ET timer désarmé (plus tmux)
	@SHIPYARD_LOOP_SESSION="$(LOOP_SESSION)" SHIPYARD_LOOP_LOG="$(LOOP_LOG)" bash "$(LOOP_SVC)" stop

loop-start: ## Réarme le timer et lance un run en arrière-plan (rend la main aussitôt)
	@SHIPYARD_LOOP_SESSION="$(LOOP_SESSION)" SHIPYARD_LOOP_LOG="$(LOOP_LOG)" bash "$(LOOP_SVC)" start

loop-restart: ## Redémarre la boucle H24 (timer réarmé + run relancé)
	@SHIPYARD_LOOP_SESSION="$(LOOP_SESSION)" SHIPYARD_LOOP_LOG="$(LOOP_LOG)" bash "$(LOOP_SVC)" restart

# ── Commandes du projet, lues dans .project/state.json ───────────────────────

define state_cmd
	@cmd="$$(jq -r '.stack_profile.commands.$(1) // empty' "$(STATE)" 2>/dev/null)"; \
	if [ -z "$$cmd" ]; then \
	  echo "❌ aucune commande '$(1)' déclarée dans $(STATE) (.stack_profile.commands.$(1))"; \
	  exit 1; \
	fi; \
	echo "→ $$cmd"; eval "$$cmd"
endef

deps: ## Installe les dépendances (commande install de state.json)
	$(call state_cmd,install)

lint: ## Lint du projet (commande lint de state.json)
	$(call state_cmd,lint)

format: ## Formatage du projet (commande format de state.json)
	$(call state_cmd,format)

test: ## Tests du projet (commande test de state.json)
	$(call state_cmd,test)

e2e: ## Tests end-to-end (commande e2e de state.json)
	$(call state_cmd,e2e)

build: ## Build du projet (commande build de state.json)
	$(call state_cmd,build)

dev: ## Serveur de dev (commande dev de state.json)
	$(call state_cmd,dev)

audit: ## Audit de dépendances (commande audit de state.json)
	$(call state_cmd,audit)

# ── Diagnostic ───────────────────────────────────────────────────────────────

status: ## Vue d'ensemble : branche, sprint, boucle, sessions, démon Happy
	@echo "── dépôt"
	@branch="$$(git -C '$(REPO_ROOT)' branch --show-current 2>/dev/null)"; \
	printf '  %s @ %s\n' "$(REPO_NAME)" "$${branch:-détaché}"
	@git -C "$(REPO_ROOT)" status --short 2>/dev/null | head -10
	@echo "── sprint"
	@jq -r '"  sprint courant : \(.current_sprint // "?")   terminés : \((.completed_sprints // []) | length)"' \
	  "$(STATE)" 2>/dev/null || echo "  (state.json illisible)"
	@$(MAKE) --no-print-directory loop-status 2>/dev/null || true
	@echo "── sessions tmux"
	@tmux list-sessions 2>/dev/null | sed 's/^/  /' || echo "  (aucune)"
	@echo "── happy"
	@if command -v happy >/dev/null 2>&1; then happy daemon status 2>/dev/null | head -5 | sed 's/^/  /'; \
	else echo "  (happy absent)"; fi

doctor: ## Vérifie les prérequis hôte de shipyard (git, jq, gh, claude, auth)
	@test -f "$(SHIPYARD_HOME)/bin/doctor.sh" || { \
	  echo "❌ $(SHIPYARD_HOME)/bin/doctor.sh absent — relancez bootstrap.sh du framework"; exit 1; }
	@bash "$(SHIPYARD_HOME)/bin/doctor.sh"
