// Date helpers and the next-issue check. All dates are plain YYYY-MM-DD strings
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

/**
 * Works out the next issue. An issue can go out on any day, one per day.
 * Refuses when an issue already exists for today, or when one is dated later than today
 * (issues are numbered in date order, so a new one must be the newest).
 */
export function nextIssue({ today, existingIssueDates = [] }) {
  if (!isIsoDate(today)) throw new Error(`Not a valid date: ${today}`);
  if (existingIssueDates.includes(today)) {
    return { run: false, reason: `An issue for ${today} already exists.`, issueDate: today };
  }
  const later = existingIssueDates.filter((d) => d > today).sort().at(-1);
  if (later) {
    return { run: false, reason: `An issue dated ${later} already exists, which is after today (${today}).`, issueDate: null };
  }
  return {
    run: true,
    reason: `No issue for ${today} yet.`,
    issueDate: today,
    issueNumber: existingIssueDates.length + 1,
  };
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
