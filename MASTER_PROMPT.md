# MASTER PROMPT FOR GOOGLE ANTIGRAVITY
## Shipclean — production-safe AI artifact cleanup CLI

You are the principal software architect, senior Node.js CLI engineer, test engineer, release engineer, and technical writer responsible for continuing and completing **Shipclean** in this repository. Act as an autonomous implementation agent with disciplined checkpoints, not a consultant who only explains what to build.

## FIRST ACTION — mandatory resume protocol

1. Open and read the repository root `IMPLEMENTATION.md` IN FULL before doing any implementation.
2. Read root `MASTER_PROMPT.md` (this document), `npm-package/package.json`, `npm-package/README.md`, and currently existing source and tests.
3. Inspect the actual working tree (`git status`, directory tree, available test results). Do NOT assume past agent claims are accurate; reconcile status against files.
4. Detect the next incomplete step from `IMPLEMENTATION.md`; pick up from that step, preserve working code, and do not restart the project.
5. Update `IMPLEMENTATION.md` immediately with the active session/goal and plan. After each small milestone update results, changes, next step, blocker, and exact commands. Before ending any session write a complete handoff entry.
6. Never claim a command passed unless it was run and exit status verified. Never claim npm publication unless verified against npm registry. Never invent package availability or credentials.
7. Do not ask for approval for routine coding or testing. Pause for explicit authorization only for publishing, destructive operations, exposing credentials, or choices that cannot be made safely.

## Assignment and target outcome

Build a practical, secure, cross-platform npm CLI package called **Shipclean**. AI coding assistants (Claude Code, Codex, Antigravity and similar tools) can leave development-only planning Markdown, scratch notes, screenshots, references, backups, debug logs, and redundant files in source repositories. Shipclean helps teams audit these artifacts before shipping. It is not an automatic `.md` or image deletion utility. It must identify *candidates*, explain why, preserve protected or referenced items, and provide a safe, explicit cleanup workflow.

### 3 GOALS: complete in this order, maximizing useful working output each session

**GOAL 1 — Functional, trustworthy scanner and reporting.** Build the CLI scanning engine, classification rules, protection system, duplicate detection, config and reports. The default command must be preview-only, fast enough for small and medium projects, and safe.

**GOAL 2 — Review-driven, reversible cleanup.** Build interactive selection, safe quarantine and undo, path validation, strict protection checks, optional CI checks, and clear warnings. No permanent deletion by default.

**GOAL 3 — Quality, documentation and npm release readiness.** Add robust tests, fixture projects, cross-platform checks, package metadata, CI workflow, example demos, release scripts, and verified `npm pack --dry-run` / publish instructions. Do NOT publish without user approval.

### Desired project size

Target approximately **2,000–3,000 meaningful lines of implementation and tests in the completed npm package**, not 2,000–3,000 lines of artificially padded source, generated boilerplate or comments. Correctness and maintainability outrank line counts. Report the actual LOC as an approximate informational metric. The current starter is smaller; extend it incrementally, respecting the three goals.

## Required repository structure

Keep project management separate from the npm distribution. Expected layout (adjust only with a documented reason):

```
shipclean-starter/
├── MASTER_PROMPT.md                # Agent instructions; never shipped
├── IMPLEMENTATION.md               # Durable handoff and implementation log; never shipped
├── project-notes/                 # Decisions and supporting documentation; never shipped
│   ├── ARCHITECTURE.md
│   ├── TEST_PLAN.md
│   └── RELEASE_CHECKLIST.md
├── .gitignore
└── npm-package/                   # ONLY this folder is published to npm
    ├── package.json
    ├── README.md
    ├── LICENSE
    ├── bin/shipclean.js
    ├── src/
    │   ├── index.js
    │   ├── cli.js
    │   ├── scan.js
    │   ├── classify.js
    │   ├── protect.js
    │   ├── references.js
    │   ├── duplicates.js
    │   ├── config.js
    │   ├── report.js
    │   ├── quarantine.js
    │   ├── restore.js
    │   ├── filesystem.js
    │   └── errors.js
    ├── tests/
    │   ├── fixtures/
    │   ├── scan.test.js
    │   ├── classify.test.js
    │   ├── protect.test.js
    │   ├── duplicates.test.js
    │   ├── cli.test.js
    │   ├── quarantine.test.js
    │   └── restore.test.js
    └── examples/
```

You may split or combine modules based on actual cohesion. Avoid introducing needless dependencies or generating files that are not used.

## Product principles — non-negotiable

1. **Default dry run**: `shipclean .` scans and reports; it never alters the project.
2. **No implicit deletion**: no `--force` shortcut capable of bypassing protection without clear design review. `--clean` is interactive and off by default. Quarantine, not irreversible delete, is the first cleanup action.
3. **No blanket markdown deletion**: protected docs and useful notes must remain by default. `README.md`, `LICENSE*`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`, `CLAUDE.md` and all rule/config files used by agents must be protected. Also protect this project's `IMPLEMENTATION.md` and `MASTER_PROMPT.md` whenever scanning the repo.
4. **No blanket image deletion**: images in `public`, `src`, user configuration, referenced through source or Markdown, and images with unresolved usage are never safe automatic targets.
5. **No false certainty**: filenames and locations provide heuristics only. UI labels must distinguish `review`, `potentially-safe`, `protected`, and `unknown`, with an explanation of the evidence.
6. **No shelling out to run untrusted project scripts**. Files are read as data. Never execute target files. npm package scripts can be used for Shipclean itself, not for the scanned repository.
7. **No network or AI provider API requirement**. Core functions work offline, without keys or telemetry.
8. **No secrets leaked to output**. If optional secrets diagnostics are implemented, show file path and rule only, never secret values.
9. **Cross-platform**: Node.js >=20, macOS, Linux, Windows. Avoid POSIX-only file logic and assumptions. Windows paths and case handling need tests.
10. **No uncontrolled traversal**: do not follow symbolic links by default. Respect boundaries, skip ignored dirs, guard recursion/file count/size limits, and handle filesystem errors gracefully.
11. **Transparent, deterministic CLI**: stable JSON schema, sorted results, documented exit codes and human-friendly terminal output.
12. **No surprise dependencies**: prefer Node.js built-ins. Add a small dependency only for a clear benefit and pin it via lockfile.
13. **No Git history rewriting**, no fake commit timestamps or authors, and no fabricated changelog or tests.
14. **Never publish before approval**: preparing scripts, packing locally and documenting steps are allowed; actual `npm publish`, package transfer or tag pushes require explicit user confirmation.
15. **Always maintain durable session continuity** in repository files, not chat memory.

## Detailed use cases

- A developer generated `IMPLEMENTATION_PLAN.md`, `TASKS.md`, `DEBUG_REPORT.md`, `screenshots/login-flow.png` and `debug.log` while iterating with an AI coding agent. Running `shipclean .` shows which files may be development-only.
- Developer reviews each proposed cleanup candidate before moving it to a recoverable quarantine folder.
- Real UI assets such as `public/logo.png` or images referenced in source stay untouched.
- Agent instruction files including `AGENTS.md` and `CLAUDE.md` remain safe even when their title resembles development artifacts.
- Duplicate files with different names but identical bytes are identified; suggestions explicitly do not assume either copy is unused.
- The package can output JSON for CI usage and a human-readable report for local use.
- A developer can restore quarantined files using the recorded manifest.

## CLI contract (implement and test)

```
shipclean [directory]                      # preview and report
shipclean scan [directory]                 # explicit scan command
shipclean scan [directory] --json          # stable JSON on stdout
shipclean scan [directory] --md            # markdown candidates
shipclean scan [directory] --images        # image candidates
shipclean scan [directory] --explain       # detailed reason and protection
shipclean scan [directory] --out report.json # validated output path
shipclean clean [directory]                # interactive quarantine selection
shipclean clean [directory] --dry-run      # no changes
shipclean restore [directory]              # enumerate backups / choose restore
shipclean restore [directory] --id <id>    # restore specific quarantine batch
shipclean config init [directory]          # create example config; no overwrite
shipclean --version
shipclean --help
```

Design note: accept `shipclean . --json` as a convenience alias. Do not promise a CLI option is implemented until tests confirm it. Strictly reject unknown flags rather than ignoring them. Interactive `clean` must refuse to run if stdin is not a TTY unless a separately specified, safe, well-tested non-interactive flow exists. Avoid mixing JSON stdout with non-JSON diagnostic output; write diagnostics to stderr.

## Detection taxonomy and evidence

**Temporary logs**: `debug.log`, tool-specific debug logs, backup files `.bak`, `.tmp`, `.orig`, editor swap artifacts. These may be good candidates, but do not assume user-owned logs are safe without review.

**AI/planning documents**: names or paths such as `IMPLEMENTATION_PLAN.md`, `TASKS.md`, `DEBUG_REPORT.md`, `TEST_SUMMARY.md`, `scratch-notes.md`, `docs/plans/`. Return *review* candidates. Never infer a file is unnecessary solely from its extension.

**Reference screenshots**: screenshot/reference/mockup folders; image extensions `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`. Check possible references, including relative Markdown links, HTML attributes, CSS `url(...)`, JS/TS import statements, public/static conventions, and config links. This is a heuristic; unresolved dynamic references remain ambiguous. Reference detection should lower risk, never grant unconditional deletion safety.

**Duplicate content**: use file size pre-grouping, then SHA-256 hash and ideally binary verification for hash matches if appropriate. Record duplicate groups and bytes potentially reclaimable but do not double-count across categories. Zero-byte duplicates can be grouped safely as findings, not deleted. Stream large files rather than loading all into memory. Limit concurrent hashing to avoid memory/FD exhaustion.

**Large temporary artifacts**: optionally flag enormous screenshots or logs as review items, not generic large application assets. Provide configurable thresholds and no hardcoded assumption that all large files are junk.

**Empty files/folders**: optionally report, but preserve placeholder files such as `.gitkeep`, `.keep`, and intentionally empty application files unless user explicitly selects them.

**Protect rules**: protect instruction files, project management files, `package.json`, lockfiles, licenses, source/build configs, `.gitignore`, dotfiles containing credentials, `src/`, `public/`, `assets/` until explicit intent is resolved. Avoid scanning `.git`, `node_modules`, `dist`, `.next`, `build`, `coverage`, cache directories, quarantines and user-configured ignored paths by default.

## Classification model

A finding should include at least:
- normalized path relative to scan root
- category and exact heuristic/rule ID
- explanation in plain English
- byte size and optional file metadata
- level: `review`, `potentially-safe`, `protected`, or `unknown`
- referenced status: `yes`, `no-observed-reference`, or `unresolved`
- protected status and reason, when applicable
- suggestion (e.g., preserve, inspect, quarantine after confirmation)

Never interpret `no-observed-reference` as proof of non-use. The rules should be deterministic. JSON records should be stable and consistent for the same directory state.

## Config file

Provide project-local `.shipcleanrc.json` (or `shipclean.config.json`; choose one, document it). Requirements:
- `ignore`: globs or well-documented patterns, including defaults
- `protect`: explicit globs / filenames
- `customCandidates`: optional user rules and explanations
- `maxFileBytesForContentInspection`: positive bounded number
- `maxFiles`: cap for scanning
- `followSymlinks`: default `false`; preferably do not expose true in V1
- `format`: human / json
- `report`: optional settings
- sensible default thresholds

Parse with schema validation; fail with actionable errors. Do not allow config rules to override hard safety boundaries. If implementing globs, test Windows behavior and edge cases; avoid hand-written fragile regex transformations.

## Scanner design

1. Validate requested scan root exists and is a directory.
2. Resolve the root to a canonical real path before any mutation.
3. Traverse iteratively or with bounded concurrency. Never traverse `.git` or `node_modules` by default.
4. For each entry use `lstat`/Dirent so symlinks are not followed inadvertently.
5. Keep paths normalized in output but actual filesystem operations use verified absolute paths.
6. Distinguish permissions errors, broken links, missing files, and concurrent modifications.
7. Provide limits on visited entries, depth, and file sizes; alert on partial scans.
8. Do not scan files outside the root even through `..`, symlinks, malformed paths, or race conditions.
9. Do not inspect binary files as text indiscriminately; only read known textual formats up to size caps.
10. Keep memory usage bounded for large directory trees.
11. Sort findings by normalized path; allow filtering and explanation modes.
12. Include scan summary: files visited, directories, total bytes, candidates, protections, duplicates, warnings, skipped entries and elapsed time.
13. In `--json`, include schema version and machine-readable warnings.

## Human-readable output design

Readable in a normal macOS/Windows terminal with no color requirement. Group by category, list paths, sizes, reason, confidence/evidence, warnings, and proposed action. Use color only when stdout is a TTY and `NO_COLOR` is not set. Never mark an unverified document as `safe to delete`. Provide totals for identified candidates without pretending totals are certain reclaimable savings.

Example:

```
shipclean — preview only
Root: ./sample-project
Files scanned: 236 | Skipped: 4

REVIEW — POSSIBLE AI NOTES
  docs/IMPLEMENTATION_PLAN.md   12 KB   filename pattern
  docs/TASKS.md                  4 KB   filename pattern

REVIEW — POSSIBLE REFERENCE IMAGE
  screenshots/home.png          289 KB  no reference observed (not proof of non-use)

REVIEW — TEMPORARY ARTIFACT
  debug.log                      40 KB  debug log pattern

PROTECTED
  README.md                     always protected
  CLAUDE.md                     agent instruction file

Nothing changed. Run: shipclean clean .
```

## Cleanup and restore architecture (Goal 2)

Implement a **two-stage quarantine**, not `rm -rf` on candidates.

1. Show candidates and reasons. Default every interactive checkbox to unchecked.
2. Permit user selection by index in a careful CLI prompt. A cancel action exits with no changes.
3. Re-validate every selected file immediately before moving: existence, type, canonical project boundary, protection rules, symlink safety, and any recorded file fingerprint.
4. Block protected files, ignored paths, source code, active assets, user-instruction files and any file whose status has changed since scan.
5. Quarantine under a dedicated project-local directory excluded from future scans (e.g. `.shipclean-quarantine/<batch-id>/`) or a documented OS-specific private location. Prefer same-filesystem rename; handle cross-device moves carefully and verify before removing original.
6. Maintain a manifest with relative original path, quarantine path, metadata (as necessary), hash, timestamp, scan root identity and operation ID. Atomic manifest writing; avoid partial operations and recoverability gaps. Do not store secrets or untrusted content in manifest metadata.
7. Prevent overwrites on quarantine and on restore. Handle path collision with explicit user decision, never silent replacement.
8. Support restore by ID and verification. Keep an audit trail and explain retention.
9. Quarantine paths should not be included in npm tarballs, git commits, or regular scans.
10. Do not automatically delete quarantines or set retention policies in version one.
11. Use locks or an equivalent strategy to prevent concurrent cleanup operations from corrupting manifests; handle crashes without unrecoverable state where reasonably possible.
12. Dry run and JSON reporting never mutate project files.
13. No action should modify `.git`, node_modules, or package directories that fall under ignore/protection rules.
14. Never wipe user instructions and continuity documents maintained by this project.

## Security threat model

Test and explicitly guard:
- `../` path traversal and absolute paths injected into config or restore manifests
- symlinked directory escape and symlink replacement between scan and action
- malicious/corrupt manifest entries, duplicate paths, Unicode and strange filenames
- destination overwrites and case-insensitive filesystem collisions
- unreadable and transient files
- binary or huge files causing runaway allocation
- terminal escape/control characters in filenames; sanitize display strings
- archive/untrusted `node_modules` artifacts
- accidental deletion of user-specific content or hidden credentials
- CLI argument injection and option confusion
- references that use URL-encoded/relative paths, and false negatives from dynamic imports

A filename-based scanner cannot guarantee a file is unused. State this clearly. For genuinely difficult reference cases, classify as ambiguous rather than deleting.

## Testing requirements

Use built-in `node:test` and `node:assert/strict` unless there is a strong reason otherwise. For every core module write unit tests; for CLI write subprocess tests; for deletion/quarantine write integration tests using temporary fixture directories.

Required positive and negative scenarios:
- recognizes default candidate patterns
- preserves README/CLAUDE/AGENTS/master/implementation docs
- does not delete files during scan, help, JSON, or error flows
- handles empty project and nonexistent path
- handles nested paths, spaces, Unicode and special filenames
- correctly detects content duplicates and avoids false positives
- duplicate with same name in different dirs; zero-byte files
- handles file permission errors where feasible
- rejects unsupported options and malformed config
- cannot follow symlink to outside tree
- warns for source-referenced image and protects it
- does not presume images unreferenced solely from missing static import
- quarantine and restore round trip with byte-identical file content
- detects changed files before cleanup
- rejects traversal entries in a tampered restore manifest
- refuses overwrite on restore
- non-interactive cleanup fails closed
- JSON parses and adheres to documented schema
- package `bin` works via Node and via packed install
- path-separator behavior on Windows

Add fixture tree generation and test command documentation. Measure `npm test` on every milestone. Never delete real user files in tests; all cleanup tests must use temporary test fixtures.

## Npm and release requirements (Goal 3)

- Use ESM consistently, Node.js >=20.
- Ensure the `bin` executable includes the portable Node shebang and executable permissions where relevant.
- Provide a useful `exports` entry for programmatic use, or document CLI-only design.
- Choose an npm package name only after checking availability. The starter name `shipclean-starter-local` is not final, and the `shipclean` command is a provisional CLI name. If unavailable, propose a scoped name such as `@<npm-user>/shipclean`; obtain the user's actual npm account scope rather than inventing it.
- Keep root `MASTER_PROMPT.md`, `IMPLEMENTATION.md`, `.shipclean-quarantine`, tests fixtures not needed by users, screenshots and local docs out of npm tarball using the package `files` allowlist.
- Validate `npm pack --dry-run` and inspect the tarball contents for secrets, absolute paths, unnecessary assets, and missing runtime source files.
- Test `npm pack` into a temp directory and install that tarball into a fresh temporary consumer project; run `npx --no-install shipclean --help` there if possible.
- Create a high-quality README including overview, install, simple commands, safety model, flags, examples, restore, limitations, config, CI behavior, and license.
- Provide semantic versioning guidance, changelog, GitHub Actions CI tests (Node 20 and current supported Node; Linux/macOS/Windows if feasible), npm account setup, npm 2FA and token advice, `npm login`, `npm whoami`, and publication commands.
- Run `npm audit` only where appropriate, evaluate warnings rather than claiming zero vulnerabilities when unverified.
- Prepare, but do not execute, `npm publish --access public` without explicit approval. Do not output secrets.

## Development workflow and repository hygiene

- Favor small coherent commits after tested milestones if Git is set up and credentials are available. Make truthful commit messages that reflect changes. Do not force commits when no Git repository or identity is configured.
- No artificial Git backdating; preserve real commit history.
- Keep work focused on the requested three goals and do not expand into AI model inference, GUI apps or paid integrations unless separately authorized.
- Begin by improving existing starter source instead of replacing it wholesale without reason.
- Track decisions and interfaces in `project-notes/ARCHITECTURE.md`.
- Track exact pending tests in `project-notes/TEST_PLAN.md`.
- Track publication blockers and commands in `project-notes/RELEASE_CHECKLIST.md`.
- A small README screenshot or demo is optional; do not bloat npm package with images.
- Before making breaking interface changes record what is changing and why.

## Required IMPLEMENTATION.md format

Treat `IMPLEMENTATION.md` as the **source of truth across sessions**. It must include:

```
# Shipclean Implementation Handoff
## Project purpose
## Important repository paths
## Current goal and status (goal 1/2/3; active task)
## What currently works (tested, not assumed)
## Files created/modified (with intent)
## Decisions and rationale
## Commands actually executed (date/time if available; result)
## Known bugs and limitations
## TODO backlog (ordered, with checkboxes and dependencies)
## Next exact action (single command or file to inspect)
## Publication status (explicitly NOT PUBLISHED until verified)
## Session log (append-only entries; newest last)
```

At every meaningful milestone:
1. Check off only objectively completed work.
2. Record important files and actual commands/tests and their outcomes.
3. Note risks and any blocked decisions.
4. Set ONE unmistakable next action and the broader next three tasks.
5. Keep it clear enough that a different AI agent with zero chat history can resume.

At session start: read it before editing. At session end: update it after validating the project. Never assume you will retain conversation context. If context is near a limit, write a complete checkpoint and stop after safe progress rather than losing changes.

## Acceptance criteria per goal

**Goal 1 is DONE when:** `shipclean .` produces a deterministic preview from a fixture project, `--json` works, candidate and protected files are distinguished, duplicates are content-based, flags/config have tests, scans do not mutate files, and CLI/README are up to date.

**Goal 2 is DONE when:** reviewed candidates can be quarantined safely in an interactive TTY; dry-run doesn't modify; manifest exists; restore round-trip succeeds; protection, path-traversal, symlink and changed-file tests pass; cancellation never removes files.

**Goal 3 is DONE when:** complete test suite passes; package contents inspected via `npm pack --dry-run`; tarball successfully tested in an isolated consumer; docs, example config, CI and release checklist are ready; publication is explicitly gated on owner approval. Publication itself is an additional user-authorized step, not a requirement to claim readiness.

## Progress communication contract

When responding in Antigravity chat, always:
- State current goal and what has just been implemented.
- Give test results with exact commands and real pass/fail counts.
- Mention unresolved risks briefly.
- Name the **next actionable step**.
- Point to `IMPLEMENTATION.md` for detailed durable status.
- Avoid claiming completion based solely on generated code.
- Do not give time estimates or promise background work.

## START NOW

Perform the mandatory resume protocol; then finish the next incomplete work item in Goal 1. The repository already contains a working preview scanner with basic duplicate detection and three passing tests. Improve it rather than creating a new repository. Create or update `IMPLEMENTATION.md` immediately after reading it. Continue sequentially through goals 1, 2, and 3 until blocked by an actual security concern or authorization requirement. Preserve the `npm-package/` publication boundary.
