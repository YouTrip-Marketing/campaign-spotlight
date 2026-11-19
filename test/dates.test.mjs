import test from 'node:test';
import assert from 'node:assert/strict';
import { nextIssue, addDays, daysBetween, isIsoDate, weekday, todayIn, formatDateLong } from '../src/lib/dates.mjs';

test('date helpers', () => {
  assert.equal(addDays('2026-12-28', 14), '2027-01-11');
  assert.equal(addDays('2027-01-05', -14), '2026-12-22');
  assert.equal(addDays('2027-01-05', -28), '2026-12-08');
  assert.equal(daysBetween('2026-11-30', '2027-01-11'), 42);
  assert.equal(weekday('2026-11-30'), 1);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-2-3'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(formatDateLong('2026-11-30'), 'Mon 30 Nov 2026');
});

test('todayIn uses the configured timezone, not the machine clock', () => {
  // 23:30 UTC on Sunday is already Monday morning in Singapore.
  assert.equal(todayIn('Asia/Singapore', new Date('2026-11-29T23:30:00Z')), '2026-11-30');
  assert.equal(todayIn('UTC', new Date('2026-11-29T23:30:00Z')), '2026-11-29');
  // Late evening in Singapore is still the same Singapore day.
  assert.equal(todayIn('Asia/Singapore', new Date('2026-11-30T15:59:00Z')), '2026-11-30');
  assert.equal(todayIn('Asia/Singapore', new Date('2026-12-31T16:00:00Z')), '2027-01-01');
});

test('the first issue can go out on any day and is number 1', () => {
  for (const day of ['2026-11-19', '2026-11-21', '2026-11-22', '2026-11-23']) {
    assert.deepEqual(nextIssue({ today: day }), {
      run: true, reason: `No issue for ${day} yet.`, issueDate: day, issueNumber: 1,
    });
  }
});

test('the next issue takes the next number, whatever the gap', () => {
  const existing = ['2026-11-20', '2026-11-21', '2026-12-30'];
  const r = nextIssue({ today: '2027-01-02', existingIssueDates: existing });
  assert.equal(r.run, true);
  assert.equal(r.issueDate, '2027-01-02');
  assert.equal(r.issueNumber, 4);
  assert.equal(nextIssue({ today: '2026-12-31', existingIssueDates: existing }).issueNumber, 4);
});

test('a second issue on the same day is refused', () => {
  const r = nextIssue({ today: '2026-11-21', existingIssueDates: ['2026-11-20', '2026-11-21'] });
  assert.equal(r.run, false);
  assert.match(r.reason, /already exists/);
  assert.equal(r.issueNumber, undefined);
});

test('an issue dated after today blocks a new one, since numbering follows date order', () => {
  const r = nextIssue({ today: '2026-11-21', existingIssueDates: ['2026-11-25'] });
  assert.equal(r.run, false);
  assert.match(r.reason, /2026-11-25 already exists, which is after today/);
});

test('a bad date is rejected', () => {
  assert.throws(() => nextIssue({ today: '21 Nov' }), /Not a valid date/);
});
