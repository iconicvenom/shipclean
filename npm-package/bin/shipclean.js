#!/usr/bin/env node
import { runCli } from '../src/cli.js';

const code = await runCli(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
  env: process.env
});
process.exit(code);
