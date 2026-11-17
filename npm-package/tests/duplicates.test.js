import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { findDuplicateGroups } from '../src/duplicates.js';
import { scanProject } from '../src/index.js';
import { withFixture, writeTree } from './helpers.js';

test('groups same-size files only after SHA-256 match', async () => withFixture(async (root) => {
  await writeTree(root, {
    'one.txt': 'payload-a',
    'nested/two.txt': 'payload-a',
    'three.txt': 'payload-b'
  });
  const files = [
    { absolute: path.join(root, 'one.txt'), relative: 'one.txt', sizeBytes: 9 },
    { absolute: path.join(root, 'nested/two.txt'), relative: 'nested/two.txt', sizeBytes: 9 },
    { absolute: path.join(root, 'three.txt'), relative: 'three.txt', sizeBytes: 9 }
  ];
  const groups = await findDuplicateGroups(files, { concurrency: 2 });
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].paths, ['nested/two.txt', 'one.txt']);
  assert.equal(groups[0].extraCopies, 1);
}));

test('groups zero-byte files without hashing them as unique content', async () => withFixture(async (root) => {
  await writeTree(root, { 'a.dat': '', 'b.dat': '', 'c.dat': 'x' });
  const report = await scanProject(root);
  const emptyGroup = report.duplicates.find((group) => group.reason === 'zero-byte-identical-files');
  assert.ok(emptyGroup);
  assert.deepEqual(emptyGroup.paths, ['a.dat', 'b.dat']);
}));

test('same filename in different directories can still duplicate', async () => withFixture(async (root) => {
  await fs.mkdir(path.join(root, 'd1'));
  await fs.mkdir(path.join(root, 'd2'));
  await fs.writeFile(path.join(root, 'd1', 'copy.bin'), 'zzzz');
  await fs.writeFile(path.join(root, 'd2', 'copy.bin'), 'zzzz');
  const report = await scanProject(root);
  assert.equal(report.duplicates.length, 1);
  assert.deepEqual(report.duplicates[0].paths, ['d1/copy.bin', 'd2/copy.bin']);
}));
