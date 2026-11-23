#!/usr/bin/env node
// Works out the next issue. Prints one JSON object. "run": true means an issue can be written today.
// The date is today in the site's timezone (config/site.json), whatever clock this machine uses.
// Usage: node scripts/next-issue.mjs [--date YYYY-MM-DD]
import { loadConfig, loadIssues } from '../src/lib/content.mjs';
import { nextIssue, todayIn, addDays, isIsoDate } from '../src/lib/dates.mjs';

const config = loadConfig();
const flag = process.argv.indexOf('--date');
const today = flag > -1 ? process.argv[flag + 1] : todayIn(config.timezone);
if (!isIsoDate(today)) {
  console.error(`--date must be YYYY-MM-DD, got ${today}`);
  process.exit(2);
}

const result = nextIssue({ today, existingIssueDates: loadIssues().map((i) => i.data.date) });
const out = { today, ...result };
if (result.run) {
  out.issueFile = `content/issues/${result.issueDate}.json`;
  // Launch dates from windowFrom to issueDate inclusive qualify: windowDays days in all.
  out.windowDays = config.windowDays;
  out.windowFrom = addDays(result.issueDate, -(config.windowDays - 1));
}
console.log(JSON.stringify(out, null, 2));
