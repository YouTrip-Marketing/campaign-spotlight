import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, cpSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { esc } from '../src/templates.mjs';
import { issueMessage, failureMessage, send, firstSentence, capLine, campaignLine, workedLines } from '../src/lib/slack.mjs';
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

test('slack line uses the summary when there is one', () => {
  const c = { brand: 'ChipsMore!', campaign: '18 Unrestricted', summary: 'A pack only younger gamers can buy.', did: 'ChipsMore! made a pack. More.' };
  assert.equal(campaignLine(c), 'A pack only younger gamers can buy.');
  const text = issueMessage(config, { number: 1, date: '2026-11-19', campaigns: [c] });
  assert.ok(text.includes('1. ChipsMore!, "18 Unrestricted": A pack only younger gamers can buy.'));
});

test('without a summary, a brand ending in "!" does not cut the line short', () => {
  const c = { brand: 'ChipsMore!', campaign: '18 Unrestricted', did: 'ChipsMore! made 18 Unrestricted, a limited pack for younger gamers. A QR code opens a Discord.' };
  assert.equal(campaignLine(c), 'ChipsMore! made 18 Unrestricted, a limited pack for younger gamers.');
  // Known limit: a name's own punctuation never ends a sentence, even at the end of one.
  // The line runs on to the next real stop, which is why issues carry a summary field.
  assert.equal(firstSentence('The pack is from ChipsMore! It sold out. More.', ['ChipsMore!']), 'The pack is from ChipsMore! It sold out.');
});

test('first sentence ignores punctuation inside names, abbreviations and decimals', () => {
  assert.equal(firstSentence('Yahoo! and Yum! Brands opened a pop-up. It ran a week.', ['Yahoo!', 'Yum! Brands']), 'Yahoo! and Yum! Brands opened a pop-up.');
  assert.equal(firstSentence('The "What? Why?" campaign ran in May. Then June.', ['What? Why?']), 'The "What? Why?" campaign ran in May.');
  assert.equal(firstSentence('Sales rose 4.5 per cent on orders over $30.50 at kfc.com.au last week. Next.'), 'Sales rose 4.5 per cent on orders over $30.50 at kfc.com.au last week.');
  assert.equal(firstSentence('One sentence only'), 'One sentence only');
  assert.equal(firstSentence('Ends here. "Quoted start" follows.'), 'Ends here.');
  assert.equal(firstSentence('A name with (brackets) and a + sign. Next.', ['(brackets)', '+']), 'A name with (brackets) and a + sign.');
});

test('long lines are capped at a word boundary', () => {
  const long = `${'word '.repeat(60)}end.`;
  const capped = capLine(long);
  assert.ok(capped.length <= 160);
  assert.ok(capped.endsWith('word...'));
  assert.equal(capLine('Short line.'), 'Short line.');
  const c = { brand: 'B', campaign: 'C', did: long };
  assert.ok(campaignLine(c).length <= 160);
});

test('issue page shows the takeaways above the posters', () => {
  const root = tempRepo(issues);
  const outDir = join(root, 'dist');
  try {
    build({ root, outDir });
    const html = readFileSync(join(outDir, 'issues', fixture.date, 'index.html'), 'utf8');
    const sum = html.indexOf('What worked this issue');
    assert.ok(sum > -1, 'no takeaways section');
    assert.ok(sum < html.indexOf('class="grid'), 'takeaways must sit above the posters');
    for (const h of ['What worked', 'Why these were picked', 'Ideas to adapt']) assert.ok(html.includes(h), h);
    for (const w of fixture.takeaways.worked) assert.ok(html.includes(esc(w.text)), w.text);
    for (const a of fixture.takeaways.adapt) assert.ok(html.includes(esc(a)), a);
    assert.ok(html.includes('Craft 5/5'), 'picked shows the criterion and score');
    assert.ok(html.includes('<span class="p2">2 Fixture Brand 2</span>'), 'patterns name their campaigns');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an issue without takeaways still builds, with no empty section', () => {
  const { takeaways: _drop, ...bare } = fixture;
  const root = tempRepo([bare]);
  const outDir = join(root, 'dist');
  try {
    build({ root, outDir });
    const html = readFileSync(join(outDir, 'index.html'), 'utf8');
    assert.ok(!html.includes('What worked this issue'));
    assert.ok(!html.includes('undefined'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('slack message has a short What worked block between the list and the link', () => {
  const text = issueMessage(config, fixture);
  const lines = text.split('\n');
  const at = lines.indexOf('What worked:');
  const lastItem = lines.findLastIndex((l) => /^\d\. /.test(l));
  const link = lines.findIndex((l) => l.startsWith('Read the issue: '));
  assert.ok(lastItem < at && at < link, 'block sits after the numbered list and before the link');
  assert.deepEqual(lines.slice(at + 1, at + 3), ['- Fixture pattern one. (1, 2)', '- Fixture pattern two. (2, 3)']);
  assert.equal(lines[at + 3], '');
  assert.ok(!text.includes('*') && !/[\u2013\u2014]/.test(text));
});

test('slack What worked block caps at 3 lines and 160 characters, and is skipped without takeaways', () => {
  const many = { takeaways: { worked: [1, 2, 3, 4].map((n) => ({ text: `${'word '.repeat(40)}${n}.`, campaigns: [1, 2] })) } };
  const lines = workedLines(many);
  assert.equal(lines.length, 4);
  assert.ok(lines.slice(1).every((l) => l.length <= 160));
  assert.deepEqual(workedLines({}), []);
  const text = issueMessage(config, { number: 1, date: '2026-11-19', campaigns: [{ brand: 'B', campaign: 'C', summary: 'S.' }] });
  assert.ok(!text.includes('What worked'));
  assert.ok(text.endsWith(`Read the issue: ${config.url}issues/2026-11-19/`));
});
