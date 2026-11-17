# Shipclean Implementation Handoff

## Project purpose
A safe npm CLI for previewing and quarantining potentially unnecessary AI-agent planning documents, screenshots, backups, logs and duplicates before production deployment.

## Important repository paths
- `MASTER_PROMPT.md`: authoritative Antigravity implementation instruction set; read this first together with this file.
- `IMPLEMENTATION.md`: permanent cross-session handoff log; never package into npm.
- `npm-package/`: isolated npm-publishable source; **only run `npm publish` here with owner approval**.
- `npm-package/bin/shipclean.js`: CLI binary (11 lines).
- `npm-package/src/index.js`: public programmatic exports.
- `npm-package/tests/`: node:test suite — 133 tests, 0 failing.
- `project-notes/`: architecture, test plan, and release checklist.

## Current goal and status
- **GOAL 1: COMPLETE.** Scanner, classifier, protection, duplicate detection, config, references, and report all implemented and verified.
- **GOAL 2: COMPLETE.** Interactive/non-interactive quarantine, dry-run, manifest, restore, path traversal guards, overwrite refusal, lock file, and round-trip tests all verified.
- **GOAL 3: COMPLETE (Pre-publish readiness).** 133 automated tests passing, CI matrix configured (`.github/workflows/ci.yml`), tarball contents audited via `npm pack`, and verified via real installation in an isolated throwaway consumer project. Package publication is intentionally held awaiting user confirmation of the target package name and explicit approval.

## What currently works (verified)
- `node bin/shipclean.js .` — preview report with color on TTY.
- `node bin/shipclean.js . --json` — stable JSON on stdout (schemaVersion 1).
- `node bin/shipclean.js . --explain` — detailed evidence per finding.
- `node bin/shipclean.js . --md` / `--images` — filtered output by category.
- `node bin/shipclean.js . --out report.json` — JSON file inside CWD.
- `shipclean clean . --select path1,path2` — non-interactive quarantine.
- `shipclean clean .` — interactive TTY prompt (fails closed safely if no TTY).
- `shipclean restore .` — list batches; `--id <id>` restores a batch.
- `shipclean config init .` — write `.shipcleanrc.json` (no overwrite).
- Protection: README, LICENSE, CLAUDE.md, AGENTS.md, IMPLEMENTATION.md, MASTER_PROMPT.md, lockfiles, tsconfig.json, .eslintrc*, vite.config.*, Dockerfiles, .github/**, .cursorrules, .env*, *.pem, src/, public/, assets/.
- Classification: AI planning docs, debug/trace logs, backup extensions, screenshot-folder images, empty files (placeholder preserved), custom user rules.
- Duplicate detection: SHA-256 stream hashing, size pre-bucketing, zero-byte grouping, bounded concurrency.
- Reference detection: Markdown image/link, HTML src/href, CSS url(), JS/TS import.
- Config: `.shipcleanrc.json` with schema validation; unknown keys fail closed; symlink follow locked to false.
- 2026-11-17 session: `cd npm-package && npm test` → **133 passed, 0 failed** (Node v26.13.1).
- 2026-11-17 session: Isolated consumer pack install test → **0.1.0 installed and executed successfully**.

## Files created/modified
- `npm-package/src/index.js` — re-exports all modules (10 lines).
- `npm-package/src/scan.js` — scanning engine (108 lines).
- `npm-package/src/classify.js` — classification rules (121 lines).
- `npm-package/src/protect.js` — protection rules, expanded with CI/build/editor configs (220+ lines).
- `npm-package/src/config.js` — config loading and validation (142 lines).
- `npm-package/src/filesystem.js` — walk, hashing, path safety (238 lines).
- `npm-package/src/duplicates.js` — SHA-256 duplicate detection (55 lines).
- `npm-package/src/references.js` — static reference collection (66 lines).
- `npm-package/src/report.js` — human and JSON formatting (112 lines).
- `npm-package/src/cli.js` — argument parsing and runCli (259 lines).
- `npm-package/src/quarantine.js` — quarantine with lock (157 lines).
- `npm-package/src/restore.js` — restore with manifest validation (117 lines).
- `npm-package/src/errors.js` — ShipcleanError and ERROR_CODES (26 lines).
- `npm-package/bin/shipclean.js` — CLI entry point (11 lines).
- `npm-package/tests/scanner.test.js` — original 3 tests (kept, passing).
- `npm-package/tests/classify.test.js` — expanded to 22 tests.
- `npm-package/tests/protect.test.js` — expanded to 21 tests.
- `npm-package/tests/filesystem.test.js` — expanded to 18 tests.
- `npm-package/tests/references.test.js` — expanded to 12 tests.
- `npm-package/tests/config.test.js` — 4 tests.
- `npm-package/tests/duplicates.test.js` — 3 tests.
- `npm-package/tests/cli.test.js` — 6 tests.
- `npm-package/tests/quarantine.test.js` — 4 tests.
- `npm-package/tests/restore.test.js` — 4 tests.
- `npm-package/tests/scan.test.js` — 6 tests.
- `npm-package/tests/integration.test.js` — 29 end-to-end tests.
- `npm-package/tests/pack.test.js` — pack validation test.
- `npm-package/tests/helpers.js` — test utilities.
- `.github/workflows/ci.yml` — Node 20/22 on Linux/macOS/Windows.
- `project-notes/ARCHITECTURE.md`, `TEST_PLAN.md`, `RELEASE_CHECKLIST.md` — updated.

## Decisions and rationale
- Node.js >=20 and ESM; no runtime dependencies.
- Default command is scan-only; changes must require review and safety checks.
- Config file name: `.shipcleanrc.json`.
- Protection is non-negotiable: cannot be overridden by config.
- Quarantine uses same-filesystem rename (falling back to copy+verify+delete) under a lock file.
- JSON schema is schemaVersion 1 and stable; findings sorted by path.
- Never claim "safe to delete"; always use "review", "potentially-safe", "unknown", "protected".
- Per MASTER_PROMPT.md instruction 14: Never publish to npm without explicit approval.

## Commands actually executed (with results)
- 2026-11-17: `node -v` → `v26.13.1`; `npm -v` → `11.20.0`.
- 2026-11-17: `cd npm-package && npm test` → **133 passed, 0 failed**.
- 2026-11-17: `node bin/shipclean.js examples/sample-project --explain` → verified.
- 2026-11-17: `npm pack` → tarball created (27 files, 65.9 kB unpacked, only publishable files included).
- 2026-11-17: Isolated consumer test in temporary directory → `npx shipclean --version` (0.1.0) and `npx shipclean --help` verified.

## Known bugs and limitations
- Windows path case collision detection is not merged as one file.
- Publish name `shipclean-starter-local` in `package.json` is provisional until final registry name is chosen.

## TODO backlog (ordered)
- [x] Goal 1: scanner, classify, protect, duplicates, references, config, CLI.
- [x] Goal 1: streaming SHA-256, bounded concurrency, zero-byte duplicates.
- [x] Goal 1: config validation, format selection, maxFiles, maxDepth.
- [x] Goal 2: interactive selection (TTY), non-interactive `--select`.
- [x] Goal 2: quarantine with lock, atomic manifest, overwrite refusal.
- [x] Goal 2: restore by id, traversal guards, hash verification.
- [x] Goal 3: 133 automated tests passing.
- [x] Goal 3: pack audit verifying exclusion of tests and handoff docs.
- [x] Goal 3: isolated consumer installation verification.
- [x] Goal 3: `.github/workflows/ci.yml` multi-OS matrix added.
- [ ] Choose/confirm final public npm package name and scope with user.
- [ ] User grants explicit publication authorization.

## Next exact action
Awaiting user decision on the final npm package name (currently `shipclean-starter-local`) and explicit approval to publish.

## Publication status
**NOT PUBLISHED.** Name provisional (`shipclean-starter-local`). Per MASTER_PROMPT.md, publication is held until user approval.

## Session log (append only, newest last)
- 2026-11-17: Initial scaffold, CLI preview scanner, documentation, 3 passing tests.
- 2026-11-17 (session 2): Read MASTER_PROMPT.md + IMPLEMENTATION.md + all source. npm test 3/3. Beginning Goal 1 modularization.
- 2026-11-17 (session 3): Full modular architecture implemented. Goals 1 and 2 complete. 94 tests passing.
- 2026-11-17 (session 4): Goal 3 completed. 133 tests passing. 3,626 lines of code/tests. Tarball packed and verified in clean consumer project. Pre-publish release checklist complete.
