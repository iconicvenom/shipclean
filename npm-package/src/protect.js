/**
 * protect.js
 *
 * Hard-coded protection rules for Shipclean. These rules are non-negotiable:
 * config settings cannot override them. They cover:
 *   - Core project files (README, LICENSE, lockfiles, package.json, etc.)
 *   - Agent instruction files (CLAUDE.md, AGENTS.md, .cursorrules, etc.)
 *   - Credential and secret files (.env, *.pem, *.key, etc.)
 *   - Protected directory trees (src/, public/, assets/)
 *   - CI/CD config files (workflow files, Dockerfiles, CI configs)
 *   - Build tool and editor configurations
 */

// Directories to skip entirely during scan traversal.
const HARD_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.nuxt',
  '.output',
  '.shipclean-quarantine',
  '.yarn',
  '.pnpm-store',
  '.vite',
  '.svelte-kit',
  'out',
  '.expo',
  '.docusaurus',
  '.storybook-static',
  '__pycache__',
  '.mypy_cache',
  '.ruff_cache',
  '.pytest_cache'
]);

// Files protected by exact (case-insensitive) basename.
const HARD_PROTECTED_NAMES = new Set([
  // Markdown documentation that must never be a cleanup target
  'readme.md',
  'readme.txt',
  'changelog.md',
  'changes.md',
  'history.md',
  'contributing.md',
  'contributors.md',
  'security.md',
  'code_of_conduct.md',
  'governance.md',
  'support.md',
  // License files
  'license',
  'license.md',
  'license.txt',
  'licence',
  'licence.md',
  'licence.txt',
  'copying',
  'copying.txt',
  // Agent instruction files
  'agents.md',
  'claude.md',
  'gemini.md',
  'openai.md',
  'codex.md',
  'codeium.md',
  // This project's own continuity documents
  'implementation.md',
  'master_prompt.md',
  // Package management
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'shrinkwrap.json',
  'npm-shrinkwrap.json',
  // Environment and version management
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.nvmrc',
  '.node-version',
  '.ruby-version',
  '.python-version',
  '.tool-versions',
  // Build/compiler configs
  'tsconfig.json',
  'jsconfig.json',
  'tsconfig.base.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'babel.config.js',
  'babel.config.json',
  'babel.config.cjs',
  '.babelrc',
  '.babelrc.js',
  '.babelrc.json',
  // Linter and formatter configs
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintignore',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.json',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierignore',
  'prettier.config.js',
  'prettier.config.cjs',
  '.stylelintrc',
  '.stylelintrc.json',
  'stylelint.config.js',
  '.editorconfig',
  // Build tool configs
  'vite.config.js',
  'vite.config.ts',
  'vite.config.mjs',
  'webpack.config.js',
  'webpack.config.ts',
  'rollup.config.js',
  'rollup.config.mjs',
  'rollup.config.ts',
  'esbuild.config.js',
  'esbuild.config.mjs',
  'turbo.json',
  'nx.json',
  'lerna.json',
  '.lernarcjson',
  'rush.json',
  // Test configs
  'jest.config.js',
  'jest.config.cjs',
  'jest.config.mjs',
  'jest.config.ts',
  'jest.config.json',
  'vitest.config.js',
  'vitest.config.ts',
  'vitest.config.mjs',
  '.mocharc.js',
  '.mocharc.cjs',
  '.mocharc.json',
  '.mocharc.yaml',
  '.mocharc.yml',
  // Type checking
  '.flowconfig',
  // Container and infra
  'dockerfile',
  'dockerfile.dev',
  'dockerfile.prod',
  '.dockerignore',
  'docker-compose.yml',
  'docker-compose.yaml',
  'docker-compose.dev.yml',
  'docker-compose.prod.yml',
  'compose.yml',
  'compose.yaml',
  // Build automation
  'makefile',
  'gnumakefile',
  'rakefile',
  'gruntfile.js',
  'gulpfile.js',
  // Misc project-level configs
  '.shipcleanrc.json',
  'shipclean.config.json',
  'sonar-project.properties',
  '.renovaterc',
  '.renovaterc.json',
  'renovate.json',
  '.releaserc',
  '.releaserc.json',
  '.releaserc.yaml',
  '.releaserc.yml',
  'release.config.js',
  'commitlint.config.js',
  '.commitlintrc',
  '.commitlintrc.json',
  '.commitlintrc.yaml',
  '.husky',
  '.lintstagedrc',
  '.lintstagedrc.js',
  '.lintstagedrc.json',
  'lint-staged.config.js',
  'postcss.config.js',
  'postcss.config.cjs',
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.ts'
]);

// Directory prefixes that always indicate protected paths.
const HARD_PROTECTED_PREFIXES = ['src/', 'public/', 'assets/'];

// File patterns for credential/secret files.
const CREDENTIAL_NAME = /(?:^|\/)(?:\.env(?:\..+)?|.+\.pem|.+\.key|id_rsa|id_ecdsa|id_ed25519|id_dsa|credentials\.json|secrets\.json|secrets\.yaml|secrets\.yml|\.netrc|\.pgpass|\.ssh\/|vault\.json)$/i;

// Agent rule and instruction files by pattern (not just name).
const AGENT_RULE_NAME = /(?:^|\/)(?:\.cursorrules|\.windsurfrules|\.clinerules|copilot-instructions\.md|\.aider|aider\.conf\.yml|\.aiderignore|\.amazonq\/|\.continue\/|\.codeium\/|gemini\.md)$/i;

// GitHub/GitLab CI configuration paths.
const CI_CONFIG_PATH = /(?:^|\/)(?:\.github\/|\.gitlab-ci\.yml|\.travis\.yml|\.circleci\/|bitbucket-pipelines\.yml|azure-pipelines\.yml|\.buildkite\/|\.drone\.yml|Jenkinsfile|\.jenkins\/)(?:.*)?$/i;

/**
 * Returns the set of directories that are hard-ignored during tree traversal.
 * @returns {Set<string>}
 */
export function hardIgnoreDirs() {
  return HARD_IGNORE_DIRS;
}

/**
 * Returns true if the given directory name is in the hard-ignore list.
 * @param {string} name  Directory basename.
 * @returns {boolean}
 */
export function isHardIgnoredDirectory(name) {
  return HARD_IGNORE_DIRS.has(String(name).toLowerCase()) || HARD_IGNORE_DIRS.has(name);
}

/**
 * Returns true if the path/name looks like a credential or secret file.
 * @param {string} posixPath  POSIX-normalized relative path.
 * @param {string} name       File basename.
 * @returns {boolean}
 */
export function isCredentialLike(posixPath, name) {
  return CREDENTIAL_NAME.test(posixPath) || CREDENTIAL_NAME.test(name);
}

/**
 * Returns the protection status for a file.
 *
 * Hard protection cannot be overridden by user config. User-specified protect
 * patterns are additive soft protection.
 *
 * @param {string}   posixPath     POSIX-normalized path relative to scan root.
 * @param {string}   name          File basename.
 * @param {string[]} extraProtect  Additional user-specified protect globs/names.
 * @returns {{ protected: boolean, hard: boolean, reason: string | null }}
 */
export function protectionFor(posixPath, name, extraProtect = []) {
  const base = String(name).toLowerCase();

  // 1. Hard-protected filenames (exact case-insensitive basename match)
  if (HARD_PROTECTED_NAMES.has(base)) {
    return {
      protected: true,
      hard: true,
      reason: `Always protected project file (${name}).`
    };
  }

  // 2. Agent instruction / editor rule files (path pattern)
  if (AGENT_RULE_NAME.test(posixPath) || AGENT_RULE_NAME.test(name)) {
    return {
      protected: true,
      hard: true,
      reason: 'Agent instruction or editor rule file.'
    };
  }

  // 3. CI/CD configuration (path pattern — applies to whole .github/ etc.)
  if (CI_CONFIG_PATH.test(posixPath)) {
    return {
      protected: true,
      hard: true,
      reason: 'CI/CD configuration file.'
    };
  }

  // 4. Credential-like files
  if (isCredentialLike(posixPath, name)) {
    return {
      protected: true,
      hard: true,
      reason: 'Looks like a credential or secret file; never a cleanup target.'
    };
  }

  // 5. Protected directory prefixes (src/, public/, assets/)
  const lowered = posixPath.toLowerCase();
  for (const prefix of HARD_PROTECTED_PREFIXES) {
    if (lowered === prefix.slice(0, -1) || lowered.startsWith(prefix)) {
      return {
        protected: true,
        hard: true,
        reason: `Path is inside protected directory ${prefix}.`
      };
    }
  }

  // 6. User-supplied extra protect patterns (soft protection)
  for (const pattern of extraProtect) {
    const needle = String(pattern).replace(/\\/g, '/').toLowerCase();
    if (needle === lowered || needle === base || lowered.endsWith(`/${needle}`)) {
      return {
        protected: true,
        hard: false,
        reason: `Matched user protect pattern: ${pattern}`
      };
    }
  }

  return { protected: false, hard: false, reason: null };
}

/**
 * Returns true if a directory should be skipped during tree traversal.
 *
 * Hard-ignores take priority over user-specified ignore patterns.
 *
 * @param {string}   name        Directory basename.
 * @param {string}   posixPath   POSIX-normalized path relative to scan root.
 * @param {string[]} extraIgnore User-specified ignore patterns.
 * @returns {boolean}
 */
export function shouldIgnoreDirectory(name, posixPath, extraIgnore = []) {
  if (isHardIgnoredDirectory(name)) return true;
  const lowered = posixPath.toLowerCase();
  for (const pattern of extraIgnore) {
    const needle = String(pattern).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    if (!needle) continue;
    if (name.toLowerCase() === needle || lowered === needle || lowered.startsWith(`${needle}/`)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true to signal that hard protection cannot be turned off by config.
 * Used internally to document the invariant.
 * @returns {true}
 */
export function cannotOverrideHardProtect() {
  return true;
}
