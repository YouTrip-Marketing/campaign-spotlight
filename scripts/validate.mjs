#!/usr/bin/env node
// Validates every issue and the registry. Exits 1 on any problem.
// Usage:
//   node scripts/validate.mjs                      structure only
//   node scripts/validate.mjs --links all          structure, then every source link
//   node scripts/validate.mjs --links 2026-11-30.json [more files]
import { basename } from 'node:path';
import { loadConfig, loadIssues, loadRegistry } from '../src/lib/content.mjs';
import { validateAll } from '../src/lib/validate.mjs';
import { checkIssueLinks } from '../src/lib/links.mjs';

const args = process.argv.slice(2);
const linksAt = args.indexOf('--links');
const linkTargets = linksAt > -1 ? args.slice(linksAt + 1).map((a) => (a === 'all' ? a : basename(a))) : [];

let issues;
let errors;
try {
  issues = loadIssues();
  errors = validateAll(issues, loadRegistry(), loadConfig());
} catch (err) {
  console.error(`FAIL  ${err.message}`);
  process.exit(1);
}

const warnings = [];
if (errors.length === 0 && linkTargets.length > 0) {
  const chosen = linkTargets.includes('all') ? issues : issues.filter((i) => linkTargets.includes(i.file));
  for (const { file, data } of chosen) {
    const res = await checkIssueLinks(file, data);
    for (const r of res.results) console.log(`link  ${r.state.padEnd(7)} ${r.detail.padEnd(9)} ${r.url}`);
    errors.push(...res.errors);
    warnings.push(...res.warnings);
  }
}

for (const w of warnings) console.log(`WARN  ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`FAIL  ${e}`);
  console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}. Nothing will be published.`);
  process.exit(1);
}
const count = issues.reduce((n, i) => n + i.data.campaigns.length, 0);
console.log(`OK    ${issues.length} issue${issues.length === 1 ? '' : 's'}, ${count} campaigns`);
