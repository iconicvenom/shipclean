import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {scanProject} from '../src/index.js';

async function fixture(fn){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'shipclean-'));
  try{await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}
}
test('flags likely artifacts but protects key docs',async()=>fixture(async root=>{
  await fs.writeFile(path.join(root,'TASKS.md'),'todo');
  await fs.writeFile(path.join(root,'README.md'),'readme');
  await fs.writeFile(path.join(root,'CLAUDE.md'),'instructions');
  await fs.writeFile(path.join(root,'debug.log'),'log');
  const report=await scanProject(root);
  assert.deepEqual(report.findings.map(x=>x.path),['debug.log','TASKS.md']);
}));
test('finds exact duplicates, not just identical names',async()=>fixture(async root=>{
  await fs.writeFile(path.join(root,'a.txt'),'same');
  await fs.writeFile(path.join(root,'b.txt'),'same');
  await fs.writeFile(path.join(root,'c.txt'),'other');
  const report=await scanProject(root);
  assert.equal(report.duplicates.length,1);
  assert.deepEqual(report.duplicates[0].paths,['a.txt','b.txt']);
}));
test('does not follow symlinked directories',async()=>fixture(async root=>{
  await fs.mkdir(path.join(root,'real'));
  await fs.writeFile(path.join(root,'real','TASKS.md'),'a');
  await fs.symlink(path.join(root,'real'),path.join(root,'linked'));
  const report=await scanProject(root);
  assert.equal(report.summary.symlinksSkipped,1);
  assert.equal(report.findings.length,1);
}));
