#!/usr/bin/env node
// Posts to Slack. Does nothing, successfully, when SLACK_WEBHOOK_URL is not set.
// Usage:
//   node scripts/slack.mjs issue 2026-11-30.json [more files]   posts the newest of the files given
//   node scripts/slack.mjs failure [run url]
//   add --dry-run to print the message instead of sending it
import { basename } from 'node:path';
import { loadConfig, loadIssues } from '../src/lib/content.mjs';
import { issueMessage, failureMessage, send } from '../src/lib/slack.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const dryRun = process.argv.includes('--dry-run');
const [mode, ...rest] = args;
const config = loadConfig();

let text;
if (mode === 'issue') {
  const wanted = rest.map((f) => basename(f));
  const matches = loadIssues().filter((i) => wanted.includes(i.file));
  if (matches.length === 0) {
    console.log('slack: no new issue file, nothing to post');
    process.exit(0);
  }
  text = issueMessage(config, matches.at(-1).data);
} else if (mode === 'failure') {
  text = failureMessage(config, rest[0]);
} else {
  console.error('Usage: slack.mjs issue <file...> | failure [run url]');
  process.exit(2);
}

if (dryRun) {
  console.log(text);
  process.exit(0);
}
try {
  const result = await send(process.env.SLACK_WEBHOOK_URL, text);
  console.log(`slack: ${result.reason}`);
} catch (err) {
  console.error(`slack: ${err.message}`);
  process.exit(1);
}
