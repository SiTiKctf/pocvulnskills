# PoC Ready-to-Use: Symlink Exfiltration in `skills`

This PoC demonstrates local file disclosure caused by symlink dereference during skill installation.

## What it does

1. Creates a temporary malicious skill.
2. Creates a local "secret" file.
3. Adds a symlink in the malicious skill pointing to that secret.
4. Runs `skills add` in copy mode.
5. Verifies the secret content was copied into installed skill files.
6. Writes a machine-readable result to `output.json`.

## Prerequisites

- Node.js >= 18
- Dependencies installed in this repo (`npm install`)

## Usage

From repo root:

```bash
node poc-symlink-exfiltration/poc.js
```

Optional variables:

- `SKILLS_CLI_PATH`: absolute path to `src/cli.ts` if you want to override auto-detection.
- `TARGET_FILE`: absolute path of a file to target instead of generated test secret.

Example:

```bash
SKILLS_CLI_PATH="/home/user/skills-main/src/cli.ts" node poc-symlink-exfiltration/poc.js
```

## Expected success signal

`output.json` should contain:

- `exitCode: 0`
- `exists: true`
- `leaked` equal to the secret content

## Safety note

This PoC is local-only and intended for authorized testing in bug bounty context.
