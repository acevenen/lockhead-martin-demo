# CentLabs Node 001 — one command per concern. Reproducible: nothing here is
# manual configuration that couldn't be recreated from the repo.

COMPOSE ?= docker compose
MODEL   ?= llama3.1:8b
EMBED   ?= nomic-embed-text

.PHONY: help up down restart ps logs health pull-model bootstrap

help:
	@echo "make up           - start the data plane"
	@echo "make down         - stop it"
	@echo "make ps           - service status"
	@echo "make logs         - tail logs"
	@echo "make health       - check each service"
	@echo "make pull-model   - pull the default chat + embedding models into Ollama"
	@echo "make bootstrap    - first-run: check .env, start, pull models"

up:
	@test -f .env || (echo 'copy .env.example to .env and fill it in first' && exit 1)
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

restart: down up

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=100

health:
	@echo "== containers ==" && $(COMPOSE) ps
	@echo "== ollama ==" && $(COMPOSE) exec -T ollama ollama list || true
	@echo "== postgres ==" && $(COMPOSE) exec -T postgres pg_isready || true
	@echo "== qdrant ==" && $(COMPOSE) exec -T caddy wget -qO- http://qdrant:6333/healthz || true

pull-model:
	$(COMPOSE) exec -T ollama ollama pull $(MODEL)
	$(COMPOSE) exec -T ollama ollama pull $(EMBED)

bootstrap: up
	@echo "waiting for ollama..." && sleep 8
	$(MAKE) pull-model
	$(MAKE) health
	@echo "Node 001 data plane is up. Open WebUI is behind Caddy at https://$${NODE_HOST:-node001}"
