#!/usr/bin/env node
// Rebuilds content/registry.json from the issue files.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadIssues } from '../src/lib/content.mjs';
import { buildRegistry } from '../src/lib/validate.mjs';

const registry = buildRegistry(loadIssues());
writeFileSync(join(ROOT, 'content', 'registry.json'), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`registry.json: ${registry.campaigns.length} campaigns`);
