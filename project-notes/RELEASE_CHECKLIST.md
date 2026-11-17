# Release checklist

- [x] Goal 1 scanner, config, reports, tests.
- [x] Goal 2 quarantine/restore with tests.
- [x] Goal 3 full test suite passing (133 tests, 0 failures).
- [x] CI workflow added at `.github/workflows/ci.yml`.
- [x] Run `npm pack` from `npm-package/` and inspect contents (27 files, no tests or handoff docs).
- [x] Test packed `.tgz` in an isolated consumer fixture (`npx shipclean --version` and `--help` verified).
- [x] Verify no secrets, credentials, or root planning files are shipped in the tarball.
- [ ] Confirm final npm package name and account scope with the owner (currently provisional `shipclean-starter-local`).
- [ ] Request explicit approval before running `npm publish`.
- [ ] Publish only from `npm-package/` after explicit user authorization.

Suggested publish flow (gated on owner authorization):

```bash
cd npm-package
npm test
npm pack --dry-run
npm login
npm whoami
# npm publish --access public
```
