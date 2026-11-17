# Release checklist

- [x] Goal 1 scanner, config, reports, tests.
- [x] Goal 2 quarantine/restore with tests.
- [x] Goal 3 full test suite passing (133 tests, 0 failures).
- [x] CI workflow added at `.github/workflows/ci.yml`.
- [x] Run `npm pack` from `npm-package/` and inspect contents (27 files, no tests or handoff docs).
- [x] Test packed `.tgz` in an isolated consumer fixture (`npx shipclean --version` and `--help` verified).
- [x] Public GitHub repository live: **https://github.com/iconicvenom/shipclean**.
- [x] Authenticate as npm user `iconic.venom`.
- [x] Package renamed to `@iconic.venom/shipclean` per registry requirements.
- [x] `npm publish --access public` executed successfully (`+ @iconic.venom/shipclean@0.1.0`).
- [x] Registered on npm: **https://www.npmjs.com/package/@iconic.venom/shipclean** (staged / processing).
