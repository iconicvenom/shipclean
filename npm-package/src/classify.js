import { matchGlob } from './filesystem.js';

const PLANNING_NAME = /^(?:implementation[_-]?plan|implementation[_-]?notes|task(?:s|[_-]?list)?|debug[_-]?report|test[_-]?summary|scratch[_-]?notes)(?:[-_.].*)?\.md$/i;
const JUNK_NAME = /(?:\.bak|\.tmp|\.orig|\.swp|~)$/i;
const LOG_NAME = /(?:^|[-_.])(?:debug|error|trace)(?:[-_.].*)?\.log$/i;
const REFERENCE_FOLDER = /(?:^|\/)(?:references?|screenshots?|mockups?)(?:\/|$)/i;
const IMAGE_NAME = /\.(?:png|jpe?g|webp|gif|svg)$/i;
const PLACEHOLDER_NAME = /^(?:\.gitkeep|\.keep)$/i;

export const LEVELS = Object.freeze({
  REVIEW: 'review',
  POTENTIALLY_SAFE: 'potentially-safe',
  PROTECTED: 'protected',
  UNKNOWN: 'unknown'
});

export function classifyFile({ name, relative, sizeBytes, protectedInfo, customCandidates = [], largeFileBytes = 5_000_000 }) {
  if (protectedInfo?.protected) {
    return {
      match: true,
      category: 'protected',
      ruleId: 'protect.hard-or-config',
      reason: 'protected',
      explanation: protectedInfo.reason,
      level: LEVELS.PROTECTED,
      suggestion: 'preserve'
    };
  }

  for (const rule of customCandidates) {
    if (matchGlob(relative, rule.pattern) || matchGlob(name, rule.pattern)) {
      return {
        match: true,
        category: rule.category || 'custom',
        ruleId: rule.ruleId || 'custom.user-rule',
        reason: rule.reason || 'custom-candidate',
        explanation: rule.explanation || 'Matched a user-defined candidate rule.',
        level: rule.level || LEVELS.REVIEW,
        suggestion: rule.suggestion || 'inspect'
      };
    }
  }

  if (PLACEHOLDER_NAME.test(name)) {
    return { match: false };
  }

  if (JUNK_NAME.test(name)) {
    return {
      match: true,
      category: 'temporary-artifact',
      ruleId: 'temp.backup-extension',
      reason: 'temporary-or-log-file',
      explanation: 'Filename matches a backup, swap, or temporary extension.',
      level: LEVELS.POTENTIALLY_SAFE,
      suggestion: 'quarantine after confirmation'
    };
  }

  if (LOG_NAME.test(name)) {
    const large = sizeBytes >= largeFileBytes;
    return {
      match: true,
      category: 'temporary-artifact',
      ruleId: large ? 'temp.debug-log-large' : 'temp.debug-log',
      reason: 'temporary-or-log-file',
      explanation: large
        ? 'Debug-style log file that is also large; still not proof it is unused.'
        : 'Filename matches a debug, error, or trace log pattern. User-owned logs still need review.',
      level: LEVELS.REVIEW,
      suggestion: 'inspect'
    };
  }

  if (PLANNING_NAME.test(name) || /(?:^|\/)docs\/plans\//i.test(relative)) {
    return {
      match: true,
      category: 'ai-planning-document',
      ruleId: 'md.planning-name',
      reason: 'possible-ai-planning-document',
      explanation: 'Filename or path resembles an AI planning or scratch document. Extension alone is never enough to delete Markdown.',
      level: LEVELS.REVIEW,
      suggestion: 'inspect'
    };
  }

  if (REFERENCE_FOLDER.test(relative) && IMAGE_NAME.test(name)) {
    const large = sizeBytes >= largeFileBytes;
    return {
      match: true,
      category: 'reference-image',
      ruleId: large ? 'img.screenshot-folder-large' : 'img.screenshot-folder',
      reason: 'possible-reference-image',
      explanation: 'Image sits in a screenshots/references/mockups folder. Static reference checks are heuristic only; no-observed-reference is not proof of non-use.',
      level: LEVELS.REVIEW,
      suggestion: 'inspect'
    };
  }

  if (sizeBytes === 0 && !PLACEHOLDER_NAME.test(name)) {
    return {
      match: true,
      category: 'empty-file',
      ruleId: 'empty.file',
      reason: 'empty-file',
      explanation: 'Empty file. Placeholder files such as .gitkeep are preserved; this is informational only.',
      level: LEVELS.UNKNOWN,
      suggestion: 'inspect'
    };
  }

  return { match: false };
}

export function isImagePath(posixPath) {
  return IMAGE_NAME.test(posixPath);
}

export function isTextInspectable(name) {
  return /\.(?:md|markdown|html?|css|scss|js|mjs|cjs|jsx|ts|tsx|json|yml|yaml|txt|svg)$/i.test(name);
}
