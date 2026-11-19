// Date helpers and the fortnight guard. All dates are plain YYYY-MM-DD strings
// and all arithmetic is done in UTC on whole days, so there is no clock or DST drift.

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toDayNumber(date) {
  if (!isIsoDate(date)) throw new Error(`Not a valid date: ${date}`);
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function fromDayNumber(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date, days) {
  return fromDayNumber(toDayNumber(date) + days);
}

export function daysBetween(from, to) {
  return toDayNumber(to) - toDayNumber(from);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function assertSchedule(schedule) {
  const { anchorMonday, intervalWeeks } = schedule;
  if (!isIsoDate(anchorMonday) || weekday(anchorMonday) !== 1) {
    throw new Error(`anchorMonday must be a Monday in YYYY-MM-DD form, got ${anchorMonday}`);
  }
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1) {
    throw new Error(`intervalWeeks must be a positive whole number, got ${intervalWeeks}`);
  }
}

/** True when the date is an issue Monday: on or after the anchor, a whole number of intervals away. */
export function isIssueDay(date, schedule) {
  assertSchedule(schedule);
  const diff = daysBetween(schedule.anchorMonday, date);
  return diff >= 0 && diff % (schedule.intervalWeeks * 7) === 0;
}

/** First issue Monday that is on or after the given date. */
export function nextIssueDay(date, schedule) {
  assertSchedule(schedule);
  const cycle = schedule.intervalWeeks * 7;
  const diff = daysBetween(schedule.anchorMonday, date);
  if (diff <= 0) return schedule.anchorMonday;
  return addDays(schedule.anchorMonday, Math.ceil(diff / cycle) * cycle);
}

/**
 * The fortnight guard.
 * Runs when today is an issue Monday, or up to graceDays after one (a late run still
 * files the issue under that Monday), and no issue file exists for that Monday.
 */
export function guard({ today, schedule, existingIssueDates = [] }) {
  assertSchedule(schedule);
  const grace = schedule.graceDays ?? 0;
  const cycle = schedule.intervalWeeks * 7;
  const diff = daysBetween(schedule.anchorMonday, today);

  if (diff < 0) {
    return { run: false, reason: `Before the first issue date (${schedule.anchorMonday}).`, issueDate: null };
  }
  const offset = diff % cycle;
  if (offset > grace) {
    const next = addDays(today, cycle - offset);
    return { run: false, reason: `Off week. Next issue date is ${next}.`, issueDate: null };
  }
  const issueDate = addDays(today, -offset);
  if (existingIssueDates.includes(issueDate)) {
    return { run: false, reason: `Issue ${issueDate} already exists.`, issueDate };
  }
  return { run: true, reason: `Issue day ${issueDate}.`, issueDate };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "30 Nov 2026" */
export function formatDate(date) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Mon 30 Nov 2026" */
export function formatDateLong(date) {
  return `${WEEKDAYS[weekday(date)]} ${formatDate(date)}`;
}
