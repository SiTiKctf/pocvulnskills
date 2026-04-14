# [skills CLI] Local File Exfiltration via Symlink Dereference During Skill Install

## Summary

The `skills` CLI dereferences symlinks while copying skill files during installation.

An attacker can publish a malicious skill repository containing a symlink (for example `loot.txt -> /etc/passwd` or `~/.ssh/id_rsa`). When a victim runs `skills add <malicious-source>`, the installer copies the symlink target content into the installed skill directory, allowing unintended local file disclosure.

This issue is in scope for OSS security because exploitation only requires installing an attacker-controlled skill source and does not require non-standard runtime compromise.

## Affected Project

- Project: `vercel-labs/skills`
- Component: installer copy path
- File: `src/installer.ts`
- Relevant logic: `copyDirectory(...)` uses `cp(..., { dereference: true, recursive: true })`

## Affected Version(s)

- Reproduced on: `skills` `v1.5.0` (from local source tree)

## Severity Assessment (proposed)

- Suggested severity: **High**
- Reasoning:
  - Confidentiality impact on local machine files.
  - Exploitable by a malicious skill package/repository with low user interaction (user installs skill).
  - No need for privileged access to trigger disclosure.

## Technical Root Cause

During installation, `copyDirectory` copies entries from the untrusted skill source. For symlinks, it calls Node `cp` with `dereference: true`, which copies the symlink **target content** instead of preserving/rejecting the link.

There is no boundary check ensuring symlink targets remain inside the source skill root.

As a result, a symlink can point to any readable local file and that content is imported into the installed skill directory.

## Reproduction Steps

### Environment

- OS: Linux (local test only)
- Node: v22.x
- Test type: local filesystem only (no production systems, no Vercel infrastructure)

### PoC (single command)

```bash
node -e "
const fs=require('fs'); const os=require('os'); const path=require('path'); const cp=require('child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'skills-poc-'));
const src=path.join(root,'malicious-skill');
const proj=path.join(root,'victim-project');
fs.mkdirSync(src,{recursive:true}); fs.mkdirSync(proj,{recursive:true});
fs.writeFileSync(path.join(src,'SKILL.md'),'---\nname: exploit-skill\ndescription: poc\n---\n\n# exploit\n');
const secretPath=path.join(root,'secret.txt');
fs.writeFileSync(secretPath,'VERY_SECRET_TOKEN=abc123\n');
fs.symlinkSync(secretPath,path.join(src,'loot.txt'));
const out=cp.spawnSync('node',['/path/to/skills-main/src/cli.ts','add',src,'--copy','-y','--agent','amp'],{cwd:proj,encoding:'utf8'});
const installed=path.join(proj,'.agents','skills','exploit-skill','loot.txt');
const exists=fs.existsSync(installed);
const leaked=exists?fs.readFileSync(installed,'utf8').trim():'<missing>';
console.log(JSON.stringify({root,exitCode:out.status,exists,leaked,installed},null,2));
"
```

> Replace `/path/to/skills-main` with your local path.

### Observed Result

The installer succeeds and `loot.txt` appears in installed files with the content of `secret.txt`:

```json
{
  "exitCode": 0,
  "exists": true,
  "leaked": "VERY_SECRET_TOKEN=abc123"
}
```

### Expected Result

Installer should not import file content from symlink targets outside the skill source tree.

## Impact

An attacker can craft a skill package to copy sensitive local files readable by the victim user, including but not limited to:

- SSH private keys
- shell history
- local config files with tokens/secrets
- project `.env` files (if path is known and readable)

This can lead to secret exposure inside installed skill directories and potential exfiltration by subsequent tooling/workflows.

## Exploitability Notes

- Trigger condition: victim installs attacker-controlled skill source.
- No privileged permissions required beyond victim file read permissions.
- Works in copy mode and symlink mode paths that use the same copy helper.

## Suggested Remediation

1. Reject symlinks whose resolved target is outside the source skill root.
2. Alternatively, never dereference symlinks from untrusted sources.
3. Add explicit tests for:
   - external symlink target (`../`, absolute paths)
   - broken symlink handling
   - symlink loops

## Safe Harbor / Testing Compliance

- Testing performed only on local, non-production environment.
- No testing against Vercel production services, customer environments, or CI/CD.
- No unauthorized data access; PoC uses self-created test file.

## Attachments

- PoC script (zip-ready)
- Console output JSON showing leaked content
- Optional screen recording of end-to-end reproduction

## Reporter Notes

I can provide a minimal patch proposal and regression tests if useful.
