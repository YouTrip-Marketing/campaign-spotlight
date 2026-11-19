import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatus, classifyError, checkLink, checkIssueLinks } from '../src/lib/links.mjs';

/** Fake fetch: map of url -> status number, or an Error to throw. */
function fakeFetch(map, calls = []) {
  return async (url) => {
    calls.push(url);
    const value = map[url];
    if (value instanceof Error) throw value;
    return { status: value, body: null };
  };
}
const dnsError = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
const resetError = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });

const issueWith = (urls) => ({ campaigns: [{ sources: urls.map((url) => ({ label: 'x', url })) }] });

test('status classes', () => {
  assert.equal(classifyStatus(200), 'ok');
  assert.equal(classifyStatus(404), 'dead');
  assert.equal(classifyStatus(410), 'dead');
  assert.equal(classifyStatus(403), 'blocked');
  assert.equal(classifyStatus(429), 'blocked');
  assert.equal(classifyStatus(503), 'blocked');
  assert.equal(classifyStatus(202), 'ok');
  assert.equal(classifyError(dnsError), 'dead');
  assert.equal(classifyError(resetError), 'blocked');
});

test('a dead link fails the issue', async () => {
  const fetchImpl = fakeFetch({ 'https://a.test/1': 200, 'https://b.test/1': 200, 'https://c.test/gone': 404 });
  const res = await checkIssueLinks('x.json', issueWith(['https://a.test/1', 'https://b.test/1', 'https://c.test/gone']), { fetchImpl });
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /dead link https:\/\/c\.test\/gone \(HTTP 404\)/);
});

test('a host that does not exist fails the issue', async () => {
  const fetchImpl = fakeFetch({ 'https://a.test/1': 200, 'https://b.test/1': 200, 'https://nope.test/': dnsError });
  const res = await checkIssueLinks('x.json', issueWith(['https://a.test/1', 'https://b.test/1', 'https://nope.test/']), { fetchImpl });
  assert.match(res.errors[0], /dead link https:\/\/nope\.test\//);
});

test('a bot wall is a warning when 2 other sources work', async () => {
  const fetchImpl = fakeFetch({ 'https://a.test/1': 200, 'https://b.test/1': 200, 'https://wall.test/': 403 });
  const res = await checkIssueLinks('x.json', issueWith(['https://a.test/1', 'https://b.test/1', 'https://wall.test/']), { fetchImpl });
  assert.deepEqual(res.errors, []);
  assert.equal(res.warnings.length, 1);
});

test('a bot wall does not count towards the 2 working sources', async () => {
  const fetchImpl = fakeFetch({ 'https://a.test/1': 200, 'https://wall.test/': 403 });
  const res = await checkIssueLinks('x.json', issueWith(['https://a.test/1', 'https://wall.test/']), { fetchImpl });
  assert.match(res.errors[0], /1 of 2 source links confirmed working, needs 2/);
});

test('blocked links are retried once, dead links are not', async () => {
  const calls = [];
  const fetchImpl = fakeFetch({ 'https://wall.test/': 503, 'https://gone.test/': 404 }, calls);
  await checkLink('https://wall.test/', { fetchImpl });
  await checkLink('https://gone.test/', { fetchImpl });
  assert.deepEqual(calls, ['https://wall.test/', 'https://wall.test/', 'https://gone.test/']);
});
