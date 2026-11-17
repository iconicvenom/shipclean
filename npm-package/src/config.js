import fsp from 'node:fs/promises';
import path from 'node:path';
import { ShipcleanError, ERROR_CODES } from './errors.js';
import { matchGlob } from './filesystem.js';

export const CONFIG_FILENAME = '.shipcleanrc.json';

export const DEFAULT_CONFIG = Object.freeze({
  ignore: [],
  protect: [],
  customCandidates: [],
  maxFileBytesForContentInspection: 1_048_576,
  maxFiles: 20_000,
  maxDepth: 40,
  followSymlinks: false,
  format: 'human',
  report: {},
  largeFileBytes: 5_000_000,
  hashConcurrency: 4
});

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_CONFIG));

export function validateConfig(raw, { source = CONFIG_FILENAME } = {}) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ShipcleanError(
      `${source} must be a JSON object.`,
      ERROR_CODES.INVALID_CONFIG,
      2
    );
  }
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ShipcleanError(
        `Unknown config key "${key}" in ${source}. Allowed: ${[...ALLOWED_KEYS].join(', ')}.`,
        ERROR_CODES.INVALID_CONFIG,
        2
      );
    }
  }
  const config = { ...DEFAULT_CONFIG, ...raw, report: { ...DEFAULT_CONFIG.report, ...(raw.report || {}) } };
  if (config.followSymlinks !== false) {
    throw new ShipcleanError(
      'followSymlinks must be false in v1. Symlink following is not exposed.',
      ERROR_CODES.INVALID_CONFIG,
      2
    );
  }
  assertStringArray(config.ignore, 'ignore', source);
  assertStringArray(config.protect, 'protect', source);
  if (!Array.isArray(config.customCandidates)) {
    throw new ShipcleanError('customCandidates must be an array.', ERROR_CODES.INVALID_CONFIG, 2);
  }
  config.customCandidates = config.customCandidates.map((rule, index) => {
    if (!rule || typeof rule !== 'object') {
      throw new ShipcleanError(`customCandidates[${index}] must be an object.`, ERROR_CODES.INVALID_CONFIG, 2);
    }
    if (typeof rule.pattern !== 'string' || !rule.pattern) {
      throw new ShipcleanError(`customCandidates[${index}].pattern must be a non-empty string.`, ERROR_CODES.INVALID_CONFIG, 2);
    }
    return {
      pattern: rule.pattern,
      category: rule.category || 'custom',
      explanation: rule.explanation || 'Matched a user-defined candidate rule.',
      ruleId: rule.ruleId || `custom.${index}`,
      reason: rule.reason || 'custom-candidate',
      level: rule.level || 'review',
      suggestion: rule.suggestion || 'inspect'
    };
  });
  config.maxFileBytesForContentInspection = boundedInt(config.maxFileBytesForContentInspection, 256, 50_000_000, 'maxFileBytesForContentInspection');
  config.maxFiles = boundedInt(config.maxFiles, 1, 1_000_000, 'maxFiles');
  config.maxDepth = boundedInt(config.maxDepth, 1, 256, 'maxDepth');
  config.largeFileBytes = boundedInt(config.largeFileBytes, 1, 1_000_000_000, 'largeFileBytes');
  config.hashConcurrency = boundedInt(config.hashConcurrency, 1, 16, 'hashConcurrency');
  if (config.format !== 'human' && config.format !== 'json') {
    throw new ShipcleanError('format must be "human" or "json".', ERROR_CODES.INVALID_CONFIG, 2);
  }
  return config;
}

function assertStringArray(value, name, source) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ShipcleanError(`${name} in ${source} must be an array of strings.`, ERROR_CODES.INVALID_CONFIG, 2);
  }
}

function boundedInt(value, min, max, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ShipcleanError(
      `${name} must be an integer between ${min} and ${max}.`,
      ERROR_CODES.INVALID_CONFIG,
      2
    );
  }
  return number;
}

export async function loadConfig(scanRoot, { explicit } = {}) {
  if (explicit) return validateConfig(explicit, { source: 'provided-config' });
  const filePath = path.join(scanRoot, CONFIG_FILENAME);
  let raw;
  try {
    raw = await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ...DEFAULT_CONFIG, report: { ...DEFAULT_CONFIG.report } };
    throw new ShipcleanError(`Cannot read ${CONFIG_FILENAME}: ${error.message}`, ERROR_CODES.INVALID_CONFIG, 2);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ShipcleanError(`${CONFIG_FILENAME} contains invalid JSON.`, ERROR_CODES.INVALID_CONFIG, 2);
  }
  return validateConfig(parsed);
}

export function exampleConfig() {
  return {
    ignore: ['vendor/', 'tmp/'],
    protect: ['docs/handbook.md'],
    customCandidates: [
      {
        pattern: 'NOTES.md',
        category: 'ai-planning-document',
        explanation: 'Team-specific scratch notes filename.'
      }
    ],
    maxFileBytesForContentInspection: 1048576,
    maxFiles: 20000,
    maxDepth: 40,
    followSymlinks: false,
    format: 'human',
    largeFileBytes: 5000000,
    hashConcurrency: 4
  };
}

export function matchesUserIgnore(posixPath, ignorePatterns) {
  return ignorePatterns.some((pattern) => matchGlob(posixPath, pattern));
}
