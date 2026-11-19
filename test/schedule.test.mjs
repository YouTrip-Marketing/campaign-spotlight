import test from 'node:test';
import { loadConfig, scheduleFrom } from '../src/lib/content.mjs';
import assert from 'node:assert/strict';
import {
  guard, isIssueDay, nextIssueDay, addDays, daysBetween, isIsoDate, weekday, todayIn, formatDateLong,
} from '../src/lib/schedule.mjs';

const schedule = { anchorMonday: '2026-11-30', intervalWeeks: 2, graceDays: 2 };
const run = (today, existing = []) => guard({ today, schedule, existingIssueDates: existing });

test('date helpers', () => {
  assert.equal(addDays('2026-12-28', 14), '2027-01-11');
  assert.equal(daysBetween('2026-11-30', '2027-01-11'), 42);
  assert.equal(weekday('2026-11-30'), 1);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-2-3'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(formatDateLong('2026-11-30'), 'Mon 30 Nov 2026');
});

test('todayIn uses the configured timezone, not UTC', () => {
  // 23:30 UTC on Sunday is already Monday morning in Singapore.
  assert.equal(todayIn('Asia/Singapore', new Date('2026-11-29T23:30:00Z')), '2026-11-30');
  assert.equal(todayIn('UTC', new Date('2026-11-29T23:30:00Z')), '2026-11-29');
});

test('guard skips before the anchor', () => {
  const r = run('2026-11-23');
  assert.equal(r.run, false);
  assert.match(r.reason, /Before the first issue/);
});

test('guard runs on the anchor Monday', () => {
  assert.deepEqual(run('2026-11-30'), { run: true, reason: 'Issue day 2026-11-30.', issueDate: '2026-11-30' });
});

test('guard skips the off week and names the next issue date', () => {
  const r = run('2026-12-07');
  assert.equal(r.run, false);
  assert.match(r.reason, /2026-12-14/);
});

test('guard keeps the fortnight across New Year (2026 has 53 ISO weeks)', () => {
  const mondays = ['2026-12-14', '2026-12-21', '2026-12-28', '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25'];
  assert.deepEqual(mondays.map((d) => run(d).run), [true, false, true, false, true, false, true]);
  // ISO week parity would run both 28 Dec (week 53) and 4 Jan (week 1). The anchor count does not.
  assert.equal(run('2026-12-28').issueDate, '2026-12-28');
  assert.equal(run('2027-01-04').run, false);
});

test('guard stays in step over a whole year, including a leap day', () => {
  let date = '2026-11-30';
  for (let i = 0; i < 80; i += 1) {
    assert.equal(run(date).run, i % 2 === 0, date);
    assert.equal(weekday(date), 1);
    date = addDays(date, 7);
  }
});

test('guard skips when the issue already exists', () => {
  const r = run('2026-12-14', ['2026-11-30', '2026-12-14']);
  assert.equal(r.run, false);
  assert.match(r.reason, /already exists/);
});

test('a late run inside the grace period files under the Monday', () => {
  assert.equal(run('2026-12-15').issueDate, '2026-12-14');
  assert.equal(run('2026-12-16').run, true);
  assert.equal(run('2026-12-17').run, false);
  assert.equal(run('2026-12-15', ['2026-12-14']).run, false);
});

test('guard rejects a bad anchor', () => {
  assert.throws(() => guard({ today: '2026-12-01', schedule: { anchorMonday: '2026-12-01', intervalWeeks: 2 } }), /Monday/);
  assert.throws(() => guard({ today: '2026-12-01', schedule: { anchorMonday: '2026-11-30', intervalWeeks: 0 } }));
});

test('isIssueDay and nextIssueDay', () => {
  assert.equal(isIssueDay('2026-11-30', schedule), true);
  assert.equal(isIssueDay('2026-12-07', schedule), false);
  assert.equal(isIssueDay('2026-11-16', schedule), false);
  assert.equal(nextIssueDay('2026-11-19', schedule), '2026-11-30');
  assert.equal(nextIssueDay('2026-11-30', schedule), '2026-11-30');
  assert.equal(nextIssueDay('2026-12-01', schedule), '2026-12-14');
  assert.equal(nextIssueDay('2026-12-29', schedule), '2027-01-11');
});

test('the configured anchor: first issue day, off weeks, New Year, issue numbering inputs', () => {
  const live = scheduleFrom(loadConfig());
  const go = (today, existing = []) => guard({ today, schedule: live, existingIssueDates: existing });
  const anchor = live.anchorMonday;
  assert.equal(weekday(anchor), 1);
  assert.deepEqual(go(anchor), { run: true, reason: `Issue day ${anchor}.`, issueDate: anchor });
  assert.equal(go(addDays(anchor, -7)).run, false);
  assert.equal(go(addDays(anchor, 7)).run, false);
  assert.equal(go(addDays(anchor, 14)).run, true);
  assert.equal(go(anchor, [anchor]).run, false);
  // Every Monday for a year alternates run, skip from the anchor, across New Year.
  for (let i = 0; i < 53; i += 1) assert.equal(go(addDays(anchor, i * 7)).run, i % 2 === 0);
});

test('a cloud machine on UTC still gets the Singapore date at 08:00 SGT', () => {
  // 08:00 SGT on Mon 23 Nov 2026 is 00:00 UTC the same day; 07:00 SGT is still Sunday in UTC.
  assert.equal(todayIn('Asia/Singapore', new Date('2026-11-23T00:00:00Z')), '2026-11-23');
  assert.equal(todayIn('Asia/Singapore', new Date('2026-11-22T23:00:00Z')), '2026-11-23');
  assert.equal(todayIn('UTC', new Date('2026-11-22T23:00:00Z')), '2026-11-22');
});
