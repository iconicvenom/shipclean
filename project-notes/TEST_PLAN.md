# Test plan

Command: `cd npm-package && npm test` (`node:test`).

Covered:
- Candidate vs protected names, src/public/assets, credentials
- Duplicates including zero-byte and same basename in different dirs
- Config validation and ignore/protect/custom rules
- Static reference detection and “not proof of non-use”
- CLI help/version/json/filters/out/config init/unknown flags
- Scan does not mutate; missing path; maxFiles partial warning
- Symlink skip; node_modules skip
- Quarantine dry-run, select, changed-file, traversal
- Restore round-trip, overwrite refusal, tampered manifest
- npm pack --dry-run file allowlist

Still optional / environment-dependent:
- chmod-unreadable files on Windows
- Real cross-device EXDEV moves
- Packed tarball install in a throwaway consumer (manual Goal 3 command)
