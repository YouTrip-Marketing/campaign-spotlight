#!/usr/bin/env node
// Lists issue files added between two commits, one per line.
// Usage: node scripts/new-issues.mjs <before sha> <after sha>
// A missing or all-zero "before" (first push, manual run) lists nothing.
import { execFileSync } from 'node:child_process';

const [before, after = 'HEAD'] = process.argv.slice(2);
const SHA = /^[0-9a-f]{7,40}$/i;

if (!before || !SHA.test(before) || /^0+$/.test(before) || !(after === 'HEAD' || SHA.test(after))) {
  process.exit(0);
}
try {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=A', before, after, '--', 'content/issues/'],
    { encoding: 'utf8' },
  );
  const files = out.split('\n').filter((f) => /^content\/issues\/\d{4}-\d{2}-\d{2}\.json$/.test(f));
  if (files.length) console.log(files.join('\n'));
} catch {
  // "before" is not in this clone (force push). Treat as nothing new.
  process.exit(0);
}
