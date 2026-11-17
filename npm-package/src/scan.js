import { classifyFile, LEVELS } from './classify.js';
import { loadConfig, matchesUserIgnore } from './config.js';
import { findDuplicateGroups } from './duplicates.js';
import { resolveScanRoot, walkTree } from './filesystem.js';
import { protectionFor, shouldIgnoreDirectory } from './protect.js';
import { collectReferences } from './references.js';

function findingRecord(file, classification, referenced) {
  return {
    path: file.relative,
    category: classification.category,
    ruleId: classification.ruleId,
    reason: classification.reason,
    explanation: classification.explanation,
    sizeBytes: file.sizeBytes,
    mtimeMs: file.mtimeMs,
    level: classification.level,
    referenced,
    protected: classification.level === LEVELS.PROTECTED,
    protectionReason: classification.level === LEVELS.PROTECTED ? classification.explanation : null,
    suggestion: classification.suggestion,
    action: classification.level === LEVELS.PROTECTED ? 'preserve' : 'review'
  };
}

export async function scanProject(root, options = {}) {
  const started = Date.now();
  const resolvedRoot = await resolveScanRoot(root);
  const config = options.config
    ? await loadConfig(resolvedRoot, { explicit: options.config })
    : await loadConfig(resolvedRoot);
  const maxFiles = options.maxFiles ?? config.maxFiles;
  const walked = await walkTree(resolvedRoot, {
    maxFiles,
    maxDepth: config.maxDepth,
    shouldIgnoreDir: (name, relative) => shouldIgnoreDirectory(name, relative, config.ignore)
  });

  const inspectable = [];
  const findings = [];
  const protectedFiles = [];
  const fileIndex = new Map();

  for (const file of walked.files) {
    fileIndex.set(file.relative, file);
    if (matchesUserIgnore(file.relative, config.ignore)) continue;
    inspectable.push(file);
  }

  const refs = await collectReferences(resolvedRoot, inspectable, {
    maxBytes: config.maxFileBytesForContentInspection,
    fileIndex
  });

  for (const file of inspectable) {
    const protectedInfo = protectionFor(file.relative, file.name, config.protect);
    const classification = classifyFile({
      name: file.name,
      relative: file.relative,
      sizeBytes: file.sizeBytes,
      protectedInfo,
      customCandidates: config.customCandidates,
      largeFileBytes: config.largeFileBytes
    });
    const referenced = refs.statusFor(file.relative);
    if (protectedInfo.protected) {
      protectedFiles.push(findingRecord(file, {
        ...classification,
        category: 'protected',
        ruleId: 'protect.hard-or-config',
        reason: 'protected',
        explanation: protectedInfo.reason,
        level: LEVELS.PROTECTED,
        suggestion: 'preserve'
      }, referenced));
      continue;
    }
    if (!classification.match) continue;
    const record = findingRecord(file, classification, referenced);
    if (referenced === 'yes') {
      record.suggestion = 'preserve';
      record.explanation = `${record.explanation} A static reference was observed (still not proof of all usages).`;
    }
    findings.push(record);
  }

  const duplicates = await findDuplicateGroups(inspectable, { concurrency: config.hashConcurrency });
  findings.sort((a, b) => a.path.localeCompare(b.path));
  protectedFiles.sort((a, b) => a.path.localeCompare(b.path));

  return {
    schemaVersion: 1,
    root: resolvedRoot,
    summary: {
      ...walked.summary,
      flaggedFiles: findings.length,
      protectedFiles: protectedFiles.length,
      duplicateGroups: duplicates.length,
      warnings: walked.warnings.length,
      elapsedMs: Date.now() - started
    },
    findings,
    protected: protectedFiles,
    duplicates,
    warnings: walked.warnings,
    notice: 'Preview only. No files were modified or deleted. A flagged file may be required by your project. no-observed-reference is not proof of non-use.'
  };
}
