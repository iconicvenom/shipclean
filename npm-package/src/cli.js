import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES, ShipcleanError } from './errors.js';
import { scanProject } from './scan.js';
import { formatHumanReport, formatJson } from './report.js';
import { CONFIG_FILENAME, exampleConfig } from './config.js';
import { isInsideRoot } from './filesystem.js';
import { quarantineSelected } from './quarantine.js';
import { listQuarantineBatches, restoreBatch } from './restore.js';

const HELP = `shipclean — safe preview of AI development artifacts

Usage:
  shipclean [directory]                      preview and report
  shipclean scan [directory]                 explicit scan
  shipclean scan [directory] --json          JSON on stdout
  shipclean scan [directory] --md            markdown candidates
  shipclean scan [directory] --images        image candidates
  shipclean scan [directory] --explain       detailed reasons
  shipclean scan [directory] --out FILE      write JSON report
  shipclean clean [directory]                interactive quarantine
  shipclean clean [directory] --dry-run      no changes
  shipclean clean [directory] --select PATHS comma-separated relative paths
  shipclean restore [directory]              list quarantine batches
  shipclean restore [directory] --id ID      restore a batch
  shipclean config init [directory]          write example .shipcleanrc.json
  shipclean --version
  shipclean --help

Default is preview-only. Scan never deletes files.
Unknown flags are rejected. --clean/--delete/--yes are not accepted; use the clean command.
`;

const COMMANDS = new Set(['scan', 'clean', 'restore', 'config']);

export function parseArgs(argv) {
  const flags = {
    json: false,
    md: false,
    images: false,
    explain: false,
    out: null,
    dryRun: false,
    id: null,
    select: null,
    help: false,
    version: false
  };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '--help' || arg === '-h') { flags.help = true; continue; }
    if (arg === '--version' || arg === '-v') { flags.version = true; continue; }
    if (arg === '--json') { flags.json = true; continue; }
    if (arg === '--md') { flags.md = true; continue; }
    if (arg === '--images') { flags.images = true; continue; }
    if (arg === '--explain') { flags.explain = true; continue; }
    if (arg === '--dry-run') { flags.dryRun = true; continue; }
    if (arg === '--clean' || arg === '--yes' || arg === '--delete' || arg === '--force') {
      throw new ShipcleanError(
        'Deletion flags are not accepted. Use "shipclean clean" for review-driven quarantine.',
        ERROR_CODES.UNKNOWN_OPTION,
        2
      );
    }
    if (arg === '--out' || arg === '--id' || arg === '--select') {
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) {
        throw new ShipcleanError(`${arg} requires a value.`, ERROR_CODES.INVALID_USAGE, 2);
      }
      i += 1;
      if (arg === '--out') flags.out = value;
      if (arg === '--id') flags.id = value;
      if (arg === '--select') flags.select = value;
      continue;
    }
    if (arg.startsWith('--out=')) { flags.out = arg.slice(6); continue; }
    if (arg.startsWith('--id=')) { flags.id = arg.slice(5); continue; }
    if (arg.startsWith('--select=')) { flags.select = arg.slice(9); continue; }
    if (arg.startsWith('-')) {
      throw new ShipcleanError(`Unknown option: ${arg}`, ERROR_CODES.UNKNOWN_OPTION, 2);
    }
    positionals.push(arg);
  }

  let command = 'scan';
  let subcommand = null;
  const rest = [...positionals];
  if (rest[0] && COMMANDS.has(rest[0])) {
    command = rest.shift();
  }
  if (command === 'config') {
    subcommand = rest.shift() || null;
    if (subcommand !== 'init') {
      throw new ShipcleanError('Usage: shipclean config init [directory]', ERROR_CODES.INVALID_USAGE, 2);
    }
  }
  if (rest.length > 1) {
    throw new ShipcleanError('Supply at most one directory.', ERROR_CODES.INVALID_USAGE, 2);
  }
  return { command, subcommand, directory: rest[0] ?? '.', flags };
}

export function readPackageVersion() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

async function writeReportOut(outPath, cwd, jsonText) {
  const resolved = path.resolve(cwd, outPath);
  if (!isInsideRoot(cwd, resolved) && path.dirname(resolved) !== path.resolve(cwd)) {
    throw new ShipcleanError('Output path must stay inside the current working directory.', ERROR_CODES.OUTPUT_PATH_INVALID, 2);
  }
  if (!/\.(json|md)$/i.test(resolved)) {
    throw new ShipcleanError('--out path must end with .json or .md.', ERROR_CODES.OUTPUT_PATH_INVALID, 2);
  }
  await fsp.mkdir(path.dirname(resolved), { recursive: true });
  await fsp.writeFile(resolved, jsonText, 'utf8');
  return resolved;
}

async function promptSelect(findings, io) {
  if (!io.stdin.isTTY) {
    throw new ShipcleanError(
      'clean requires a TTY, or pass --select path1,path2 for the non-interactive flow.',
      ERROR_CODES.NOT_A_TTY,
      2
    );
  }
  io.stdout.write('Enter comma-separated indexes to quarantine, or "cancel":\n');
  findings.forEach((item, index) => {
    io.stdout.write(`  [${index + 1}] ${item.path} (${item.reason})\n`);
  });
  const answer = await readLine(io);
  const trimmed = answer.trim().toLowerCase();
  if (!trimmed || trimmed === 'cancel' || trimmed === 'none') return [];
  const indexes = trimmed.split(',').map((part) => Number(part.trim()));
  if (indexes.some((n) => !Number.isInteger(n) || n < 1 || n > findings.length)) {
    throw new ShipcleanError('Invalid selection index.', ERROR_CODES.INVALID_USAGE, 2);
  }
  return indexes.map((n) => findings[n - 1].path);
}

function readLine(io) {
  return new Promise((resolve) => {
    const onData = (chunk) => {
      io.stdin.off('data', onData);
      if (io.stdin.isTTY) io.stdin.setRawMode?.(false);
      resolve(String(chunk).split(/\r?\n/)[0] ?? '');
    };
    io.stdin.resume();
    io.stdin.once('data', onData);
  });
}

export async function runCli(argv, io) {
  const stdout = io.stdout;
  const stderr = io.stderr;
  const cwd = io.cwd || process.cwd();
  const env = io.env || process.env;
  try {
    const parsed = parseArgs(argv);
    if (parsed.flags.help) {
      stdout.write(`${HELP}\n`);
      return 0;
    }
    if (parsed.flags.version) {
      stdout.write(`${readPackageVersion()}\n`);
      return 0;
    }
    const root = path.resolve(cwd, parsed.directory);
    if (parsed.command === 'config' && parsed.subcommand === 'init') {
      const dest = path.join(root, CONFIG_FILENAME);
      try {
        await fsp.writeFile(dest, `${JSON.stringify(exampleConfig(), null, 2)}\n`, { flag: 'wx' });
      } catch (error) {
        if (error && error.code === 'EEXIST') {
          throw new ShipcleanError(`${CONFIG_FILENAME} already exists.`, ERROR_CODES.INVALID_USAGE, 2);
        }
        throw error;
      }
      stderr.write(`Wrote ${dest}\n`);
      return 0;
    }
    if (parsed.command === 'scan') {
      const report = await scanProject(root);
      const view = {
        md: parsed.flags.md,
        images: parsed.flags.images,
        explain: parsed.flags.explain,
        color: Boolean(stdout.isTTY) && env.NO_COLOR == null
      };
      const jsonText = formatJson(report, view);
      if (parsed.flags.out) {
        const dest = await writeReportOut(parsed.flags.out, cwd, jsonText);
        stderr.write(`Wrote ${dest}\n`);
      }
      if (parsed.flags.json) stdout.write(`${jsonText}\n`);
      else stdout.write(`${formatHumanReport(report, view)}\n`);
      return 0;
    }
    if (parsed.command === 'clean') {
      const report = await scanProject(root);
      let selected = [];
      if (parsed.flags.select) {
        selected = parsed.flags.select.split(',').map((part) => part.trim()).filter(Boolean);
      } else {
        selected = await promptSelect(report.findings, io);
      }
      const result = await quarantineSelected({
        root,
        selected,
        dryRun: parsed.flags.dryRun,
        scanReport: report
      });
      const output = parsed.flags.json ? JSON.stringify(result, null, 2) : formatCleanResult(result);
      stdout.write(`${output}\n`);
      return 0;
    }
    if (parsed.command === 'restore') {
      if (!parsed.flags.id) {
        const listed = await listQuarantineBatches(root);
        stdout.write(`${parsed.flags.json ? JSON.stringify(listed, null, 2) : formatRestoreList(listed)}\n`);
        return 0;
      }
      const result = await restoreBatch({ root, id: parsed.flags.id, dryRun: parsed.flags.dryRun });
      stdout.write(`${parsed.flags.json ? JSON.stringify(result, null, 2) : formatRestoreResult(result)}\n`);
      return 0;
    }
    throw new ShipcleanError('Unknown command.', ERROR_CODES.INVALID_USAGE, 2);
  } catch (error) {
    const message = error instanceof ShipcleanError ? error.message : (error && error.message) || String(error);
    stderr.write(`${message}\n`);
    return error instanceof ShipcleanError ? error.exitCode : 1;
  }
}

function formatCleanResult(result) {
  if (result.dryRun) return `Dry run. Would quarantine ${result.moved.length} file(s). Nothing changed.`;
  if (!result.moved.length) return 'No files quarantined.';
  return `Quarantined ${result.moved.length} file(s) as batch ${result.id}. Restore with: shipclean restore . --id ${result.id}`;
}

function formatRestoreList(listed) {
  if (!listed.batches.length) return 'No quarantine batches found.';
  return listed.batches.map((batch) => `${batch.id}  ${batch.itemCount} file(s)  ${batch.createdAt}`).join('\n');
}

function formatRestoreResult(result) {
  if (result.dryRun) return `Dry run. Would restore ${result.restored.length} file(s).`;
  return `Restored ${result.restored.length} file(s) from ${result.id}.`;
}
