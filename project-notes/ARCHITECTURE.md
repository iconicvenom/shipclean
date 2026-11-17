# Architecture notes

- Root project notes and handoff are not published. Only `npm-package/` is the npm distribution boundary.
- Default scanner is read-only. Cleanup is explicit quarantine plus restore.
- Config file is `.shipcleanrc.json`. `followSymlinks` is locked to `false`.
- Modules: `errors`, `filesystem`, `protect`, `classify`, `duplicates`, `references`, `config`, `scan`, `report`, `cli`, `quarantine`, `restore`.
- Reports use POSIX-relative paths, schemaVersion 1, sorted findings.
- Hard protect names and `src/` `public/` `assets/` cannot be turned off by config.
- Duplicate detection: group by size, SHA-256 via streams, bounded concurrency; zero-byte files grouped without hashing.
- Quarantine lives in `.shipclean-quarantine/<id>/manifest.json` with rename-into-place and a `.lock` file.
- See `MASTER_PROMPT.md` for the threat model and CLI contract.
