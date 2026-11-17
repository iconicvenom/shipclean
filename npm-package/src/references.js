import path from 'node:path';
import { readTextFileBounded, toPosix, isInsideRoot } from './filesystem.js';
import { isImagePath, isTextInspectable } from './classify.js';

const MARKDOWN_REF = /!?\[[^\]]*]\(\s*<?([^)\s>]+)>?\s*\)/g;
const HTML_REF = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
const CSS_URL = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi;
const JS_IMPORT = /(?:import\s+(?:[^'"\n]*from\s+)?|export\s+[^'"\n]*from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

function collectRaw(content) {
  const found = new Set();
  for (const regex of [MARKDOWN_REF, HTML_REF, CSS_URL, JS_IMPORT]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content))) {
      const value = match[1] || match[2];
      if (value) found.add(value);
    }
  }
  return found;
}

function isSkippableRef(raw) {
  return /^(?:[a-z]+:|\/\/|#|data:)/i.test(raw);
}

export function resolveReference(scanRoot, fromFileAbsolute, rawRef) {
  const trimmed = decodeURIComponent(String(rawRef).trim().split(/[?#]/)[0]);
  if (!trimmed || isSkippableRef(trimmed)) return null;
  const fromDir = path.dirname(fromFileAbsolute);
  const absolute = path.resolve(fromDir, trimmed);
  if (!isInsideRoot(scanRoot, absolute)) return null;
  return toPosix(path.relative(scanRoot, absolute));
}

export async function collectReferences(scanRoot, files, { maxBytes, fileIndex }) {
  const referenced = new Set();
  const unresolvedSources = [];
  for (const file of files) {
    if (!isTextInspectable(file.name)) continue;
    const result = await readTextFileBounded(file.absolute, maxBytes);
    if (result.skipped) {
      if (result.reason === 'too-large' || result.reason === 'binary') {
        unresolvedSources.push(file.relative);
      }
      continue;
    }
    for (const raw of collectRaw(result.content)) {
      const resolved = resolveReference(scanRoot, file.absolute, raw);
      if (resolved) referenced.add(resolved);
    }
  }

  const statusFor = (posixPath) => {
    if (referenced.has(posixPath)) return 'yes';
    if (!isImagePath(posixPath)) return 'no-observed-reference';
    if (unresolvedSources.length) return 'unresolved';
    const base = posixPath.split('/').pop();
    for (const key of referenced) {
      if (key.split('/').pop() === base) return 'yes';
    }
    return 'no-observed-reference';
  };

  return { referenced, unresolvedSources, statusFor, fileIndex };
}
