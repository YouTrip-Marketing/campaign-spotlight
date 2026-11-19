#!/usr/bin/env node
// Fortnight guard. Prints one JSON object. "run": true means write an issue today.
// Usage: node scripts/guard.mjs [--date YYYY-MM-DD]
import { loadConfig, loadIssues, scheduleFrom } from '../src/lib/content.mjs';
import { guard, todayIn, addDays, isIsoDate } from '../src/lib/schedule.mjs';

const config = loadConfig();
const flag = process.argv.indexOf('--date');
const today = flag > -1 ? process.argv[flag + 1] : todayIn(config.timezone);
if (!isIsoDate(today)) {
  console.error(`--date must be YYYY-MM-DD, got ${today}`);
  process.exit(2);
}

const issues = loadIssues();
const result = guard({
  today,
  schedule: scheduleFrom(config),
  existingIssueDates: issues.map((i) => i.data.date),
});

const out = { today, ...result };
if (result.run) {
  out.issueNumber = issues.length + 1;
  out.issueFile = `content/issues/${result.issueDate}.json`;
  out.window14From = addDays(result.issueDate, -config.windowDays[0]);
  out.window28From = addDays(result.issueDate, -config.windowDays[1]);
}
console.log(JSON.stringify(out, null, 2));
