SHELL := /bin/bash

COREPACK ?= corepack
YARN ?= yarn
NPM ?= npm
NODE ?= node
RELEASE_REMOTE ?= origin
RELEASE_BASE_BRANCH ?= master
RELEASE_BRANCH_PREFIX ?= release
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

.PHONY: help doctor install build format format-check regression test test-plugin test-hoc verify ci pack clean clean-all tag-release release-pr

help:
	@printf "$(BOLD)Available targets$(RESET)\n"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "doctor" "Check local toolchain and Node version"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "install" "Install dependencies for root and ./test"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "build" "Build TypeScript sources"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "format" "Format source files with Prettier"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "format-check" "Check formatting with Prettier"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "test" "Run build + regression tests"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "test-plugin" "Run webpack plugin integration test"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "test-hoc" "Run webpack HOC integration test"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "verify" "Run full local validation suite"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "ci" "Install and run full validation suite"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "pack" "Build and run npm pack --dry-run"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "clean" "Remove build/test artifacts"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "clean-all" "Remove artifacts and node_modules"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "tag-release" "Create release tag from package.json or start release PR flow"
	@printf "  $(CYAN)%-14s$(RESET) %s\n" "release-pr" "Create release PR to master for VERSION=x.y.z"
	@printf "\n"
	@printf "$(YELLOW)Usage$(RESET)\n"
	@printf "  make tag-release VERSION=x.y.z\n"
	@printf "  make tag-release\n"
	@printf "  make release-pr VERSION=x.y.z\n"
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

format:
	@$(PRINT_TITLE) "Formatting files"
	@$(NPM) run format
	@$(NPM) run format:readme
	@$(PRINT_OK) "Formatting completed"

format-check:
	@$(PRINT_TITLE) "Checking formatting"
	@$(NPM) run format:check
	@$(NPM) run format:check:readme
	@$(PRINT_OK) "Formatting check passed"

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

verify: format-check test test-plugin test-hoc
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
ifeq ($(strip $(VERSION)),)
	@$(PRINT_TITLE) "Creating release tag from package.json"
	@TAG_VERSION="$$($(NODE) -p "require('./package.json').version")"; \
	TAG_NAME="v$$TAG_VERSION"; \
	TAG_MESSAGE="[ADD] - release v$$TAG_VERSION;"; \
	if git rev-parse --verify "refs/tags/$$TAG_NAME" >/dev/null 2>&1; then \
		$(PRINT_ERR) "tag $$TAG_NAME already exists locally"; \
		exit 1; \
	fi; \
	if git ls-remote --exit-code --tags "$(RELEASE_REMOTE)" "refs/tags/$$TAG_NAME" >/dev/null 2>&1; then \
		$(PRINT_ERR) "tag $$TAG_NAME already exists on $(RELEASE_REMOTE)"; \
		exit 1; \
	fi; \
	git tag -a "$$TAG_NAME" -m "$$TAG_MESSAGE"; \
	$(PRINT_OK) "Created tag $$TAG_NAME"; \
	git push "$(RELEASE_REMOTE)" "$$TAG_NAME"; \
	$(PRINT_OK) "Pushed tag $$TAG_NAME to $(RELEASE_REMOTE)"
else
	@$(MAKE) release-pr VERSION="$(VERSION)" RELEASE_REMOTE="$(RELEASE_REMOTE)" RELEASE_BASE_BRANCH="$(RELEASE_BASE_BRANCH)" RELEASE_BRANCH_PREFIX="$(RELEASE_BRANCH_PREFIX)"
endif

release-pr:
	@$(PRINT_TITLE) "Preparing release PR"
	@if [ -z "$(VERSION)" ]; then \
		$(PRINT_ERR) "VERSION is required. Usage: make release-pr VERSION=x.y.z"; \
		exit 1; \
	fi
	@command -v gh >/dev/null || { $(PRINT_ERR) "gh CLI is required for PR flow"; exit 1; }
	@AUTH_TOKEN="$${GH_TOKEN:-$${GITHUB_TOKEN:-}}"; \
	if [ -z "$$AUTH_TOKEN" ] && ! gh auth status >/dev/null 2>&1; then \
		$(PRINT_ERR) "Set GH_TOKEN/GITHUB_TOKEN or run: gh auth login"; \
		exit 1; \
	fi
	@if ! git diff --quiet || ! git diff --cached --quiet; then \
		$(PRINT_ERR) "Working tree is not clean. Commit or stash changes first."; \
		exit 1; \
	fi
	@AUTH_TOKEN="$${GH_TOKEN:-$${GITHUB_TOKEN:-}}"; \
	TAG_VERSION="$(VERSION)"; \
	TAG_NAME="v$$TAG_VERSION"; \
	COMMIT_MESSAGE="[ADD] - release v$$TAG_VERSION;"; \
	BRANCH_NAME="$(RELEASE_BRANCH_PREFIX)/v$$TAG_VERSION"; \
	if ! $(NODE) -e "const v=process.argv[1]; if(!/^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z.-]+)?$$/.test(v)){process.exit(1)}" "$$TAG_VERSION"; then \
		$(PRINT_ERR) "VERSION must look like x.y.z or x.y.z-suffix"; \
		exit 1; \
	fi; \
	if git rev-parse --verify "refs/tags/$$TAG_NAME" >/dev/null 2>&1; then \
		$(PRINT_ERR) "tag $$TAG_NAME already exists locally"; \
		exit 1; \
	fi; \
	if git ls-remote --exit-code --tags "$(RELEASE_REMOTE)" "refs/tags/$$TAG_NAME" >/dev/null 2>&1; then \
		$(PRINT_ERR) "tag $$TAG_NAME already exists on $(RELEASE_REMOTE)"; \
		exit 1; \
	fi; \
	if git show-ref --verify --quiet "refs/heads/$$BRANCH_NAME"; then \
		$(PRINT_ERR) "local branch $$BRANCH_NAME already exists"; \
		exit 1; \
	fi; \
	if git ls-remote --exit-code --heads "$(RELEASE_REMOTE)" "$$BRANCH_NAME" >/dev/null 2>&1; then \
		$(PRINT_ERR) "remote branch $$BRANCH_NAME already exists on $(RELEASE_REMOTE)"; \
		exit 1; \
	fi; \
	git fetch "$(RELEASE_REMOTE)" "$(RELEASE_BASE_BRANCH)"; \
	git checkout -b "$$BRANCH_NAME" "$(RELEASE_REMOTE)/$(RELEASE_BASE_BRANCH)"; \
	$(NPM) version "$$TAG_VERSION" --no-git-tag-version; \
	git add package.json; \
	if [ -f package-lock.json ]; then git add package-lock.json; fi; \
	if [ -f yarn.lock ]; then git add yarn.lock; fi; \
	git commit -m "$$COMMIT_MESSAGE"; \
	git push -u "$(RELEASE_REMOTE)" "$$BRANCH_NAME"; \
	if [ -n "$$AUTH_TOKEN" ]; then \
		PR_URL="$$(GH_TOKEN="$$AUTH_TOKEN" gh pr create --base "$(RELEASE_BASE_BRANCH)" --head "$$BRANCH_NAME" --title "$$COMMIT_MESSAGE" --body "Automated release bump to $$TAG_NAME.\n\nAfter merge to $(RELEASE_BASE_BRANCH), run:\n\nmake tag-release")"; \
	else \
		PR_URL="$$(gh pr create --base "$(RELEASE_BASE_BRANCH)" --head "$$BRANCH_NAME" --title "$$COMMIT_MESSAGE" --body "Automated release bump to $$TAG_NAME.\n\nAfter merge to $(RELEASE_BASE_BRANCH), run:\n\nmake tag-release")"; \
	fi; \
	$(PRINT_OK) "Created PR: $$PR_URL"; \
	$(PRINT_WARN) "Merge PR into $(RELEASE_BASE_BRANCH), then run: make tag-release"
