SHELL := /bin/bash

COREPACK ?= corepack
YARN ?= yarn
NPM ?= npm
NODE ?= node
NO_COLOR ?=

ifeq ($(NO_COLOR),1)
RESET :=
BOLD :=
CYAN :=
GREEN :=
YELLOW :=
RED :=
else
RESET := \033[0m
BOLD := \033[1m
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
endif

PRINT_TITLE = printf "$(BOLD)$(CYAN)==> %s$(RESET)\n"
PRINT_OK = printf "$(GREEN)[ok]$(RESET) %s\n"
PRINT_WARN = printf "$(YELLOW)[warn]$(RESET) %s\n"
PRINT_ERR = printf "$(RED)[error]$(RESET) %s\n"

.DEFAULT_GOAL := help

.PHONY: help doctor install build regression test test-plugin test-hoc verify ci pack clean clean-all tag-release

help:
	@printf "$(BOLD)Available targets$(RESET)\n"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "doctor" "Check local toolchain and Node version"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "install" "Install dependencies for root and ./test"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "build" "Build TypeScript sources"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "test" "Run build + regression tests"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "test-plugin" "Run webpack plugin integration test"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "test-hoc" "Run webpack HOC integration test"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "verify" "Run full local validation suite"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "ci" "Install and run full validation suite"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "pack" "Build and run npm pack --dry-run"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "clean" "Remove build/test artifacts"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "clean-all" "Remove artifacts and node_modules"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "tag-release" "Create release tag matching package.json"
	@printf "\n"
	@printf "$(YELLOW)Usage$(RESET)\n"
	@printf "  make tag-release VERSION=x.y.z\n"
	@printf "  make NO_COLOR=1 help\n"

doctor:
	@$(PRINT_TITLE) "Checking toolchain"
	@command -v $(NODE) >/dev/null || { $(PRINT_ERR) "node is required"; exit 1; }
	@command -v $(NPM) >/dev/null || { $(PRINT_ERR) "npm is required"; exit 1; }
	@$(NODE) -e "const [maj,min]=process.versions.node.split('.').map(Number); if (maj < 14 || (maj === 14 && min < 10)) { console.error('Node >= 14.10 is required'); process.exit(1); }"
	@$(NODE) -v
	@$(NPM) -v
	@$(PRINT_OK) "Toolchain is ready"

install: doctor
	@$(PRINT_TITLE) "Installing dependencies"
	@if command -v $(COREPACK) >/dev/null; then $(COREPACK) enable; fi
	@if command -v $(YARN) >/dev/null; then \
		$(YARN) install --frozen-lockfile; \
		$(YARN) --cwd test install --frozen-lockfile; \
	else \
		$(PRINT_WARN) "yarn is not available, using npm install fallback"; \
		$(NPM) install --no-package-lock; \
		$(NPM) --prefix test install --no-package-lock; \
	fi
	@$(PRINT_OK) "Dependencies installed"

build:
	@$(PRINT_TITLE) "Building package"
	@$(NPM) run build
	@$(PRINT_OK) "Build completed"

regression:
	@$(PRINT_TITLE) "Running regression tests"
	@$(NPM) run test:regression
	@$(PRINT_OK) "Regression tests passed"

test: build regression

test-plugin:
	@$(PRINT_TITLE) "Running plugin integration test"
	@$(NPM) --prefix test run test-plugin
	@$(PRINT_OK) "Plugin integration test passed"

test-hoc:
	@$(PRINT_TITLE) "Running HOC integration test"
	@$(NPM) --prefix test run test-hoc
	@$(PRINT_OK) "HOC integration test passed"

verify: test test-plugin test-hoc
	@$(PRINT_OK) "Full verification passed"

ci: install verify

pack: build
	@$(PRINT_TITLE) "Creating npm package preview"
	@$(NPM) pack --dry-run
	@$(PRINT_OK) "npm pack --dry-run completed"

clean:
	@$(PRINT_TITLE) "Cleaning artifacts"
	@rm -rf dist test/dist tmp tmp-* .npm-cache
	@$(PRINT_OK) "Artifacts cleaned"

clean-all: clean
	@$(PRINT_TITLE) "Cleaning node_modules"
	@rm -rf node_modules test/node_modules
	@$(PRINT_OK) "node_modules cleaned"

tag-release:
	@$(PRINT_TITLE) "Creating release tag"
	@test -n "$(VERSION)" || { $(PRINT_ERR) "Use: make tag-release VERSION=x.y.z"; exit 1; }
	@PKG_VERSION="$$($(NODE) -p "require('./package.json').version")"; \
	if [ "$$PKG_VERSION" != "$(VERSION)" ]; then \
		$(PRINT_ERR) "package.json version ($$PKG_VERSION) does not match VERSION ($(VERSION))"; \
		exit 1; \
	fi
	@git tag "v$(VERSION)"
	@$(PRINT_OK) "Created tag v$(VERSION)"
	@$(PRINT_WARN) "Push it with: git push origin v$(VERSION)"
