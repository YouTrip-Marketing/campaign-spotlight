// Reads issue files, the registry and the site config from disk.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path}: ${err.message}`);
  }
}

export function loadConfig(root = ROOT) {
  return readJson(join(root, 'config', 'site.json'));
}

/** Returns [{ file, data }] sorted by file name (oldest first). */
export function loadIssues(root = ROOT) {
  const dir = join(root, 'content', 'issues');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ file: name, data: readJson(join(dir, name)) }));
}

export function loadRegistry(root = ROOT) {
  const path = join(root, 'content', 'registry.json');
  return existsSync(path) ? readJson(path) : { campaigns: [] };
}
