import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, cpSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { esc } from '../src/templates.mjs';
import { issueMessage, failureMessage, send } from '../src/lib/slack.mjs';
import { ROOT, loadConfig } from '../src/lib/content.mjs';

const config = loadConfig();
const fixture = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'issue.json'), 'utf8'));
const issues = [fixture];

/** A throwaway copy of the repo with the given issues, so tests never depend on live content. */
function tempRepo(withIssues) {
  const root = mkdtempSync(join(tmpdir(), 'spotlight-'));
  for (const dir of ['config', 'public']) cpSync(join(ROOT, dir), join(root, dir), { recursive: true });
  mkdirSync(join(root, 'src'));
  copyFileSync(join(ROOT, 'src', 'styles.css'), join(root, 'src', 'styles.css'));
  mkdirSync(join(root, 'content', 'issues'), { recursive: true });
  for (const issue of withIssues) {
    writeFileSync(join(root, 'content', 'issues', `${issue.date}.json`), JSON.stringify(issue));
  }
  return root;
}

test('build writes every page, with noindex and no em dashes', () => {
  const root = tempRepo(issues);
  const outDir = join(root, 'dist');
  try {
    build({ root, outDir });
    const pages = ['index.html', 'issues/index.html', '404.html', ...issues.map((i) => `issues/${i.date}/index.html`)];
    for (const page of pages) {
      const html = readFileSync(join(outDir, page), 'utf8');
      assert.match(html, /<meta name="robots" content="noindex, nofollow">/, page);
      assert.ok(!html.includes('\u2014'), `${page} has an em dash`);
      assert.ok(!/sample content/i.test(html), `${page} has the sample chip`);
    }
    assert.match(readFileSync(join(outDir, 'robots.txt'), 'utf8'), /Disallow: \//);
    assert.ok(existsSync(join(outDir, 'styles.css')));
    assert.ok(existsSync(join(outDir, '.nojekyll')));

    const latest = issues.at(-1);
    const home = readFileSync(join(outDir, 'index.html'), 'utf8');
    for (const c of latest.campaigns) {
      assert.ok(home.includes(esc(c.campaign)), c.campaign);
      for (const s of c.sources) assert.ok(home.includes(`href="${esc(s.url)}"`), s.url);
    }
    assert.ok(!/Next issue|First issue/.test(home), 'no fixed-schedule label');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('build with zero issues gives a clean empty state', () => {
  const root = tempRepo([]);
  const outDir = join(root, 'dist');
  try {
    build({ root, outDir });
    const home = readFileSync(join(outDir, 'index.html'), 'utf8');
    const archive = readFileSync(join(outDir, 'issues/index.html'), 'utf8');
    assert.match(home, /No issues yet/);
    assert.match(archive, /0 issues/);
    assert.match(archive, /No issues yet/);
    for (const html of [home, archive, readFileSync(join(outDir, '404.html'), 'utf8')]) {
      assert.match(html, /noindex, nofollow/);
      assert.ok(!html.includes('undefined') && !html.includes('NaN'));
      assert.ok(!/Next issue|First issue/.test(html), 'no fixed-schedule label');
      assert.ok(!html.includes('\u2014'));
    }
    assert.ok(!existsSync(join(outDir, 'issues', '2026-11-19')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('escaping', () => {
  assert.equal(esc(`<b>"R&D"</b> it's`), '&lt;b&gt;&quot;R&amp;D&quot;&lt;/b&gt; it&#39;s');
});

test('slack issue message lists each campaign and the issue link', () => {
  const issue = issues.at(-1);
  const text = issueMessage(config, issue);
  assert.match(text, /^Campaign Spotlight, Issue \d\d \(/);
  assert.equal(text.split('\n').filter((l) => /^\d\. /.test(l)).length, issue.campaigns.length);
  assert.ok(text.endsWith(`Read the issue: ${config.url}issues/${issue.date}/`));
  assert.ok(!text.includes('*'));
});

test('slack send is a clean no-op without a webhook', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true }; };
  assert.deepEqual(await send(undefined, 'hi', fetchImpl), { sent: false, reason: 'SLACK_WEBHOOK_URL is not set, skipped' });
  assert.equal((await send('', 'hi', fetchImpl)).sent, false);
  assert.equal(called, false);
});

test('slack send posts JSON when a webhook is set, and surfaces errors', async () => {
  const seen = [];
  const ok = async (url, init) => { seen.push([url, init.body]); return { ok: true, status: 200 }; };
  assert.equal((await send('https://hooks.test/abc', 'hello', ok)).sent, true);
  assert.deepEqual(seen, [['https://hooks.test/abc', '{"text":"hello"}']]);
  await assert.rejects(send('https://hooks.test/abc', 'x', async () => ({ ok: false, status: 404 })), /HTTP 404/);
});

test('failure message carries the run link', () => {
  assert.match(failureMessage(config, 'https://example.test/run/1'), /did not publish[\s\S]*Details: https:\/\/example\.test\/run\/1/);
});
