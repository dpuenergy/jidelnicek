#!/usr/bin/env node
/**
 * inject-plan.js — injects a meal-plan JSON into jidelnicek_sablona.html
 *
 * Usage:
 *   node scripts/inject-plan.js [plan.json] [template.html] [output.html]
 *
 * Defaults:
 *   plan     = shared/sample-plan.json
 *   template = jidelnicek_sablona.html
 *   output   = dist/jidelnicek_<plan-id>.html
 *
 * The script replaces the content of the <script id="plan-data"> block in the
 * template with the provided JSON, then writes a standalone HTML file.
 *
 * Exit 0 on success, 1 on any error (missing files, invalid JSON, schema check fail).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── CLI args ──────────────────────────────────────────────────────────────────
const [,, planArg, templateArg, outputArg] = process.argv;

const ROOT     = path.resolve(__dirname, '..');
const planPath = planArg     ? path.resolve(planArg)     : path.join(ROOT, 'shared', 'sample-plan.json');
const tplPath  = templateArg ? path.resolve(templateArg) : path.join(ROOT, 'jidelnicek_sablona.html');

// ── Load & validate plan JSON ─────────────────────────────────────────────────
let planRaw, plan;
try {
  planRaw = fs.readFileSync(planPath, 'utf8');
} catch (e) {
  console.error(`inject-plan: cannot read plan file: ${planPath}\n${e.message}`);
  process.exit(1);
}
try {
  plan = JSON.parse(planRaw);
} catch (e) {
  console.error(`inject-plan: plan file is not valid JSON: ${e.message}`);
  process.exit(1);
}

// ── Minimal schema check (mirrors BEN's generátor checklist) ─────────────────
const errors = [];
if (!plan.id)       errors.push('missing "id"');
if (!plan.persons)  errors.push('missing "persons"');
if (!plan.slots || !Array.isArray(plan.slots) || plan.slots.length === 0)
                    errors.push('missing/empty "slots"');
if (!plan.days   || !Array.isArray(plan.days)  || plan.days.length === 0)
                    errors.push('missing/empty "days"');
if (plan.persons && (!plan.persons.jakub || !plan.persons.partnerka))
                    errors.push('"persons" must have keys "jakub" and "partnerka"');
if (errors.length) {
  console.error('inject-plan: plan JSON failed schema check:\n  ' + errors.join('\n  '));
  process.exit(1);
}

// ── Load template ─────────────────────────────────────────────────────────────
let html;
try {
  html = fs.readFileSync(tplPath, 'utf8');
} catch (e) {
  console.error(`inject-plan: cannot read template: ${tplPath}\n${e.message}`);
  process.exit(1);
}

// ── Replace plan-data block ───────────────────────────────────────────────────
const OPEN_TAG  = '<script id="plan-data" type="application/json">';
const CLOSE_TAG = '</script>';

const start = html.indexOf(OPEN_TAG);
const end   = html.indexOf(CLOSE_TAG, start + OPEN_TAG.length);
if (start === -1 || end === -1) {
  console.error('inject-plan: template is missing <script id="plan-data"> block');
  process.exit(1);
}

const injected = html.slice(0, start + OPEN_TAG.length)
  + '\n'
  + JSON.stringify(plan, null, 2)
  + '\n'
  + html.slice(end);

// ── Write output ──────────────────────────────────────────────────────────────
const outDir  = path.join(ROOT, 'dist');
const outFile = outputArg
  ? path.resolve(outputArg)
  : path.join(outDir, `jidelnicek_${plan.id}.html`);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, injected, 'utf8');

console.log(`inject-plan: wrote ${path.relative(ROOT, outFile)}`);

// ── Update shared/index.json ──────────────────────────────────────────────────
const indexPath = path.join(ROOT, 'shared', 'index.json');
let index = { plans: [] };
try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch(_) {}
index.plans = (index.plans || []).filter(p => p.id !== plan.id);
index.plans.unshift({
  id:           plan.id,
  title:        plan.plan_title || plan.id,
  date_range:   plan.date_range || '',
  file:         `shared/${path.basename(planPath)}`,
  generated_at: new Date().toISOString().split('T')[0],
});
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
console.log(`inject-plan: updated shared/index.json (${index.plans.length} plan${index.plans.length !== 1 ? 's' : ''})`);
