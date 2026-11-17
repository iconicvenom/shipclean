import { displaySafe } from './filesystem.js';

const COLORS = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
  green: '\u001b[32m'
};

function paint(enabled, color, text) {
  if (!enabled) return text;
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 104857.6) / 10} MB`;
}

export function filterFindings(report, { md = false, images = false } = {}) {
  if (!md && !images) return report.findings;
  return report.findings.filter((item) => {
    if (md && item.category === 'ai-planning-document') return true;
    if (images && item.category === 'reference-image') return true;
    return false;
  });
}

export function formatHumanReport(report, options = {}) {
  const color = Boolean(options.color);
  const explain = Boolean(options.explain);
  const findings = filterFindings(report, options);
  const root = displaySafe(report.root);
  const lines = [
    paint(color, 'cyan', 'shipclean — preview only'),
    `Root: ${root}`,
    `Files scanned: ${report.summary.filesScanned} | Directories: ${report.summary.dirsScanned} | Skipped: ${report.summary.skippedEntries ?? 0} | Flagged: ${findings.length} | Duplicate groups: ${report.summary.duplicateGroups}`,
    ''
  ];

  const groups = new Map();
  for (const finding of findings) {
    const key = finding.category;
    const list = groups.get(key) ?? [];
    list.push(finding);
    groups.set(key, list);
  }

  const titles = {
    'ai-planning-document': 'REVIEW — POSSIBLE AI NOTES',
    'reference-image': 'REVIEW — POSSIBLE REFERENCE IMAGE',
    'temporary-artifact': 'REVIEW — TEMPORARY ARTIFACT',
    'empty-file': 'REVIEW — EMPTY FILE',
    custom: 'REVIEW — CUSTOM RULE'
  };

  for (const [category, items] of groups) {
    lines.push(paint(color, 'yellow', titles[category] || `REVIEW — ${category.toUpperCase()}`));
    for (const item of items) {
      const label = `${displaySafe(item.path)}   ${formatSize(item.sizeBytes)}   ${item.ruleId}`;
      lines.push(`  ${label}`);
      if (explain) {
        lines.push(`    ${item.explanation}`);
        lines.push(`    level=${item.level} referenced=${item.referenced} suggestion=${item.suggestion}`);
      } else {
        lines.push(`    ${item.explanation}`);
      }
    }
    lines.push('');
  }

  if (report.protected?.length && options.explain) {
    lines.push(paint(color, 'green', 'PROTECTED'));
    for (const item of report.protected) {
      lines.push(`  ${displaySafe(item.path)}   ${item.protectionReason || item.explanation}`);
    }
    lines.push('');
  }

  if (report.duplicates?.length) {
    lines.push(paint(color, 'yellow', 'REVIEW — DUPLICATE CONTENT'));
    for (const group of report.duplicates) {
      lines.push(`  ${group.paths.map(displaySafe).join(' = ')}   ${formatSize(group.sizeBytes)} each`);
      if (explain) lines.push(`    ${group.explanation}`);
    }
    lines.push('');
  }

  if (!findings.length && !report.duplicates?.length) {
    lines.push('No candidates found.');
    lines.push('');
  }

  if (report.warnings?.length) {
    lines.push('WARNINGS');
    for (const warning of report.warnings) {
      lines.push(`  ${warning.code} ${displaySafe(warning.path || '')} ${warning.message}`);
    }
    lines.push('');
  }

  lines.push(report.notice);
  lines.push('Nothing changed. Run: shipclean clean .');
  return lines.join('\n');
}

export function formatJson(report, options = {}) {
  const findings = filterFindings(report, options);
  return JSON.stringify({ ...report, findings }, null, 2);
}
