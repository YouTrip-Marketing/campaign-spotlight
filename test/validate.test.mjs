import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAll, buildRegistry, campaignKey, canonicalUrl, normalise } from '../src/lib/validate.mjs';
import { loadConfig, loadIssues, loadRegistry } from '../src/lib/content.mjs';

const config = loadConfig();

function campaign(overrides = {}) {
  return {
    brand: 'Acme',
    campaign: 'Test Drive',
    category: 'Retail',
    market: 'Singapore',
    tags: ['Stunt'],
    launched: '2026-11-25',
    summary: 'A thing was done in a new way.',
    did: 'They did a thing.',
    why: 'It worked.',
    steal: 'Do the thing.',
    scores: { originality: 4, craft: 4, proof: 3, stealable: 4 },
    sources: [
      { label: 'One', url: 'https://one.example.com/a' },
      { label: 'Two', url: 'https://two.example.com/a' },
    ],
    ...overrides,
  };
}

function issue(date, number, campaigns) {
  return { file: `${date}.json`, data: { number, date, headline: 'A headline', windowDays: 14, campaigns } };
}

function validIssues() {
  return [
    issue('2026-11-30', 1, [
      campaign(),
      campaign({ brand: 'Bolt', campaign: 'Night Shift', category: 'Travel', sources: [
        { label: 'One', url: 'https://one.example.com/b' },
        { label: 'Three', url: 'https://three.example.com/b' },
      ] }),
    ]),
  ];
}

const check = (issues, registry = buildRegistry(issues)) => validateAll(issues, registry, config);
const has = (errors, pattern) => assert.ok(errors.some((e) => pattern.test(e)), `no error matching ${pattern}:\n${errors.join('\n')}`);

test('the issues committed to this repo are valid', () => {
  assert.deepEqual(validateAll(loadIssues(), loadRegistry(), config), []);
});

test('a well formed issue passes', () => {
  assert.deepEqual(check(validIssues()), []);
});

test('repeat campaign in a later issue is blocked, ignoring case and punctuation', () => {
  const issues = validIssues();
  issues.push(issue('2026-12-14', 2, [
    campaign({ brand: 'ACME', campaign: 'Test-Drive!', launched: '2026-12-10', sources: [
      { label: 'Four', url: 'https://four.example.com/x' },
      { label: 'Five', url: 'https://five.example.com/x' },
    ] }),
    campaign({ brand: 'Cora', campaign: 'Open Door', launched: '2026-12-10', sources: [
      { label: 'Four', url: 'https://four.example.com/y' },
      { label: 'Five', url: 'https://five.example.com/y' },
    ] }),
  ]));
  has(check(issues), /repeat\. "ACME, Test-Drive!" already ran in issues\/2026-11-30\.json/);
});

test('same brand with a different campaign is allowed', () => {
  const issues = validIssues();
  issues.push(issue('2026-12-14', 2, [
    campaign({ campaign: 'Second Idea', launched: '2026-12-10', sources: [
      { label: 'Four', url: 'https://four.example.com/x' },
      { label: 'Five', url: 'https://five.example.com/x' },
    ] }),
    campaign({ brand: 'Cora', campaign: 'Open Door', launched: '2026-12-10', sources: [
      { label: 'Four', url: 'https://four.example.com/y' },
      { label: 'Five', url: 'https://five.example.com/y' },
    ] }),
  ]));
  assert.deepEqual(check(issues), []);
});

test('a source link reused from an earlier issue is blocked', () => {
  const issues = validIssues();
  issues.push(issue('2026-12-14', 2, [
    campaign({ brand: 'Dune', campaign: 'Renamed', launched: '2026-12-10', sources: [
      { label: 'One', url: 'https://www.one.example.com/a/?utm_source=x' },
      { label: 'Five', url: 'https://five.example.com/x' },
    ] }),
    campaign({ brand: 'Cora', campaign: 'Open Door', launched: '2026-12-10', sources: [
      { label: 'Four', url: 'https://four.example.com/y' },
      { label: 'Five', url: 'https://five.example.com/y' },
    ] }),
  ]));
  has(check(issues), /repeat\. Source .* already used in issues\/2026-11-30\.json/);
});

test('fewer than 2 sources is blocked', () => {
  const issues = validIssues();
  issues[0].data.campaigns[0].sources.pop();
  has(check(issues), /needs at least 2 sources/);
});

test('two links on the same publication do not count as 2 sources', () => {
  const issues = validIssues();
  issues[0].data.campaigns[0].sources[1].url = 'https://www.one.example.com/other';
  has(check(issues), /needs 2 different publications/);
});

test('http and malformed links are blocked', () => {
  const issues = validIssues();
  issues[0].data.campaigns[0].sources[0].url = 'http://one.example.com/a';
  issues[0].data.campaigns[1].sources[0].url = 'not a link';
  const errors = check(issues);
  assert.equal(errors.filter((e) => /must be an https link/.test(e)).length, 2);
});

test('1 campaign or 4 campaigns is blocked, 3 is fine', () => {
  const one = validIssues();
  one[0].data.campaigns.pop();
  has(check(one), /needs 2 to 3 campaigns/);

  const extra = (n) => campaign({ brand: `Brand ${n}`, campaign: `Idea ${n}`, category: `Cat ${n}`, sources: [
    { label: 'A', url: `https://a.example.com/${n}` }, { label: 'B', url: `https://b.example.com/${n}` },
  ] });
  const three = validIssues();
  three[0].data.campaigns.push(extra(3));
  assert.deepEqual(check(three), []);
  three[0].data.campaigns.push(extra(4));
  has(check(three), /needs 2 to 3 campaigns/);
});

test('scores below the bar are blocked', () => {
  const low = validIssues();
  low[0].data.campaigns[0].scores = { originality: 4, craft: 3, proof: 3, stealable: 3 };
  has(check(low), /total 13 is below the bar of 14/);

  const dull = validIssues();
  dull[0].data.campaigns[0].scores = { originality: 3, craft: 5, proof: 5, stealable: 5 };
  has(check(dull), /originality: 3 is below the bar of 4/);

  const bad = validIssues();
  bad[0].data.campaigns[0].scores.craft = 6;
  has(check(bad), /scores\.craft: must be a whole number from 1 to 5/);
});

test('recency window is enforced, using peaked when present', () => {
  const old = validIssues();
  old[0].data.campaigns[0].launched = '2026-11-10';
  has(check(old), /20 days before the issue date, window is 14 days/);

  old[0].data.windowDays = 28;
  assert.deepEqual(check(old), []);

  const peaked = validIssues();
  peaked[0].data.campaigns[0].launched = '2026-09-01';
  peaked[0].data.campaigns[0].peaked = '2026-11-28';
  assert.deepEqual(check(peaked), []);

  const future = validIssues();
  future[0].data.campaigns[0].launched = '2026-12-05';
  has(check(future), /is after the issue date/);

  const odd = validIssues();
  odd[0].data.windowDays = 60;
  has(check(odd), /windowDays: must be one of 14, 28/);
});

test('em and en dashes are blocked in copy', () => {
  const issues = validIssues();
  issues[0].data.campaigns[0].steal = 'Do the thing \u2014 properly.';
  issues[0].data.headline = 'Nov 1\u20135';
  const errors = check(issues);
  has(errors, /steal: contains an em dash/);
  has(errors, /headline: contains an en dash/);
});

test('missing and over-long text is blocked', () => {
  const issues = validIssues();
  delete issues[0].data.campaigns[0].why;
  issues[0].data.campaigns[1].did = 'x'.repeat(421);
  const errors = check(issues);
  has(errors, /why: required text is missing/);
  has(errors, /did: 421 characters, limit is 420/);
});

test('file name, date and numbering must agree', () => {
  const issues = validIssues();
  issues[0].data.date = '2026-12-01';
  issues[0].data.number = 3;
  const errors = check(issues);
  has(errors, /does not match the file name/);
  has(errors, /number is 3, expected 1/);
});

test('three campaigns from one category is blocked', () => {
  const issues = validIssues();
  issues[0].data.campaigns[1].category = 'retail';
  issues[0].data.campaigns.push(campaign({ brand: 'Cora', campaign: 'Open Door', sources: [
    { label: 'A', url: 'https://a.example.com/1' }, { label: 'B', url: 'https://b.example.com/1' },
  ] }));
  has(check(issues), /all three are in the "retail" category/);
});

test('a stale registry is blocked', () => {
  const issues = validIssues();
  has(check(issues, { campaigns: [] }), /registry\.json: out of date/);
});

test('helpers', () => {
  assert.equal(normalise('  ChipsMore!  '), 'chipsmore');
  assert.equal(campaignKey('Café Néro', 'Bon & Bon'), 'cafe nero|bon and bon');
  assert.equal(canonicalUrl('https://www.site.com/a/b/?utm_campaign=z#top'), 'site.com/a/b');
  assert.equal(canonicalUrl('https://site.com/?p=12'), 'site.com?p=12');
});

test('summary is required, capped, and must not repeat the brand or campaign name', () => {
  const missing = validIssues();
  delete missing[0].data.campaigns[0].summary;
  has(check(missing), /summary: required text is missing/);

  const long = validIssues();
  long[0].data.campaigns[0].summary = `${'x'.repeat(140)}.`;
  has(check(long), /summary: 141 characters, limit is 140/);

  const brand = validIssues();
  brand[0].data.campaigns[0].summary = 'Acme sent tailors round on bicycles.';
  has(check(brand), /summary: repeats the brand name "Acme"/);

  const name = validIssues();
  name[0].data.campaigns[0].summary = 'The test drive that comes to your door.';
  has(check(name), /summary: repeats the campaign name "Test Drive"/);

  const shout = validIssues();
  shout[0].data.campaigns[0].brand = 'ChipsMore!';
  shout[0].data.campaigns[0].summary = 'From ChipsMore, a pack only younger gamers can buy.';
  has(check(shout), /summary: repeats the brand name "ChipsMore!"/);

  const open = validIssues();
  open[0].data.campaigns[0].summary = 'A line with no ending';
  has(check(open), /summary: must be one full sentence/);

  // A word that merely contains the brand is fine.
  const inside = validIssues();
  inside[0].data.campaigns[0].summary = 'Acmeville residents got a free repair visit.';
  assert.deepEqual(check(inside), []);
});
