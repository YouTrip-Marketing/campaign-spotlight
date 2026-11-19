#!/usr/bin/env node
// Builds the static site into dist/.
//   index.html                latest issue
//   issues/index.html         all issues
//   issues/<date>/index.html  one page per issue
import { mkdirSync, writeFileSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadConfig, loadIssues } from './lib/content.mjs';
import { issuePage, archivePage, emptyPage, notFoundPage } from './templates.mjs';

export function build({ root = ROOT, outDir = join(root, 'dist') } = {}) {
  const site = loadConfig(root);
  const issues = loadIssues(root).map((i) => i.data);
  const latest = issues.at(-1);

  const write = (path, html) => {
    const full = join(outDir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, html);
  };

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  if (latest) {
    write('index.html', issuePage({ site, issues, issue: latest, root: './' }));
    for (const issue of issues) {
      write(`issues/${issue.date}/index.html`, issuePage({ site, issues, issue, root: '../../' }));
    }
  } else {
    write('index.html', emptyPage({ site, root: './' }));
  }
  write('issues/index.html', archivePage({ site, issues, root: '../' }));
  write('404.html', notFoundPage({ site, siteUrl: new URL(site.url).pathname }));

  copyFileSync(join(root, 'src', 'styles.css'), join(outDir, 'styles.css'));
  for (const name of readdirSync(join(root, 'public'))) {
    copyFileSync(join(root, 'public', name), join(outDir, name));
  }
  writeFileSync(join(outDir, '.nojekyll'), '');
  return { outDir, pages: issues.length + 3 };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = build();
  console.log(`Built ${result.pages} pages into ${result.outDir}.`);
}
