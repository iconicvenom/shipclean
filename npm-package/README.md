# shipclean

Preview leftover AI-coding artifacts (planning markdown, screenshots, debug logs, backups, duplicates) before you ship. The default command **only reports**. Cleanup is a review-driven **quarantine**, not silent deletion.

## Install

```bash
npm install -g shipclean
# or run directly with npx:
# npx shipclean .
```

Requires Node.js 20 or later. Works offline. No API keys, telemetry, or execution of files inside the scanned project.

## Quick start

```bash
shipclean .
shipclean scan . --json
shipclean scan . --explain
```

Run against the bundled sample:

```bash
node bin/shipclean.js examples/sample-project --explain
```

## Safety model

- `shipclean` / `shipclean scan` never modify files.
- Markdown and images are **not** deleted because of their extension.
- `README.md`, `LICENSE*`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`, `CLAUDE.md`, `IMPLEMENTATION.md`, `MASTER_PROMPT.md`, lockfiles, and agent rule files are protected.
- Paths under `src/`, `public/`, and `assets/` are protected until you explicitly decide otherwise.
- Credential-like names (`.env`, `*.pem`, `credentials.json`) are protected.
- `.git`, `node_modules`, build/cache dirs, and `.shipclean-quarantine` are skipped.
- Symbolic links are not followed.
- `no-observed-reference` means a static scan did not see a link. It is **not** proof the file is unused.
- Never treat a finding as “safe to delete”.

## Commands

| Command | Effect |
| --- | --- |
| `shipclean [dir]` | Preview report (human) |
| `shipclean scan [dir] --json` | Stable JSON on stdout |
| `shipclean scan --md` / `--images` | Filter candidate categories |
| `shipclean scan --explain` | Extra evidence lines |
| `shipclean scan --out report.json` | Write JSON inside the current working directory |
| `shipclean clean [dir]` | Interactive quarantine (TTY) |
| `shipclean clean [dir] --dry-run` | Show moves without changing files |
| `shipclean clean [dir] --select a,b` | Non-interactive quarantine of listed relative paths |
| `shipclean restore [dir]` | List quarantine batches |
| `shipclean restore [dir] --id <id>` | Restore a batch |
| `shipclean config init [dir]` | Write `.shipcleanrc.json` (no overwrite) |
| `shipclean --help` / `--version` | Usage and version |

Unknown flags are rejected. `--clean`, `--delete`, `--yes`, and `--force` are not accepted.

Exit codes: `0` success, `1` runtime/scan error, `2` usage/config/TTY error.

## Classification

Each finding includes path, category, rule id, explanation, size, level (`review`, `potentially-safe`, `protected`, `unknown`), referenced status (`yes`, `no-observed-reference`, `unresolved`), and a suggestion.

Duplicate groups use size pre-bucketing then SHA-256. Extra copies are called out; which copy to keep is your decision. Zero-byte files can be grouped as findings.

## Config

Project file: **`.shipcleanrc.json`**

```json
{
  "ignore": ["vendor/", "tmp/"],
  "protect": ["docs/handbook.md"],
  "customCandidates": [
    {
      "pattern": "NOTES.md",
      "category": "ai-planning-document",
      "explanation": "Team scratch notes."
    }
  ],
  "maxFileBytesForContentInspection": 1048576,
  "maxFiles": 20000,
  "maxDepth": 40,
  "followSymlinks": false,
  "format": "human",
  "largeFileBytes": 5000000,
  "hashConcurrency": 4
}
```

Config cannot turn on symlink following and cannot unprotect hard safety rules. Unknown keys fail closed.

## Cleanup and restore

`clean` moves selected candidates into `.shipclean-quarantine/<batch-id>/` and writes an atomic `manifest.json`. Restore by batch id. Overwrites are refused. Manifest paths that traverse (`..`) are refused. Concurrent cleanups take a lock file.

## Programmatic use

```js
import { scanProject, formatHumanReport } from 'shipclean';

const report = await scanProject('/path/to/project');
console.log(formatHumanReport(report));
```

## CI

Use `shipclean scan . --json` as a report step. Do not enable cleanup in CI unless you pass an explicit `--select` list you have reviewed. A GitHub Actions workflow at the repository root runs `npm test` on Node 20/22 across Linux, macOS, and Windows.

## Limitations

Filename heuristics are incomplete. Dynamic image URLs, generated paths, and unusual encodings may be missed. Large binary files are not parsed as text. Windows path case collisions are not merged as one file.

## License

MIT. Confirm copyright ownership before a public release.
