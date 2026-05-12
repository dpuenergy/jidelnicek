#!/usr/bin/env node
// Reads .env (searches repo root → parent dirs) → writes js/config.js
// Usage: node scripts/gen_config.js
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out  = resolve(root, 'js', 'config.js');

// Search for .env: repo root first, then parent directories (up to 3 levels)
function findEnv(start) {
  let dir = start;
  for (let i = 0; i < 4; i++) {
    const p = resolve(dir, '.env');
    if (existsSync(p)) return p;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const envPath = findEnv(root);
if (!envPath) {
  console.error('Cannot find .env in', root, 'or any parent directory');
  process.exit(1);
}

const vars = {};
readFileSync(envPath, 'utf8').replace(/\r/g, '').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
  if (m) vars[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

const key   = vars['CLAUDE_API_KEY'] || vars['ANTHROPIC_API_KEY'] || '';
const model = vars['CLAUDE_MODEL'] || 'claude-sonnet-4-6';

if (!key) {
  console.error('No CLAUDE_API_KEY or ANTHROPIC_API_KEY found in', envPath);
  process.exit(1);
}

writeFileSync(out, `// Auto-generated — DO NOT COMMIT\nexport const CLAUDE_KEY   = '${key}';\nexport const CLAUDE_MODEL = '${model}';\n`);
console.log(`✓ js/config.js generated (key: ${key.slice(0, 12)}…, model: ${model})`);
console.log(`  .env source: ${envPath}`);

try { execSync('git update-index --skip-worktree js/config.js', { cwd: root, stdio: 'ignore' }); } catch {}
