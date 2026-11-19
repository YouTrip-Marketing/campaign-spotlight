#!/usr/bin/env node
// Posts to Slack. Does nothing, successfully, when SLACK_WEBHOOK_URL is not set.
// Usage:
//   node scripts/slack.mjs issue 2026-11-30.json [more files]   posts the newest of the files given
//   node scripts/slack.mjs latest                               posts the latest issue again (test post)
//   node scripts/slack.mjs failure [run url]
//   add --dry-run to print the message instead of sending it
//   add --require-webhook to fail, instead of skip, when SLACK_WEBHOOK_URL is not set
// The webhook URL is never printed.
import { basename } from 'node:path';
import { loadConfig, loadIssues } from '../src/lib/content.mjs';
import { issueMessage, failureMessage, send } from '../src/lib/slack.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const requireWebhook = process.argv.includes('--require-webhook');
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
} else if (mode === 'latest') {
  const latest = loadIssues().at(-1);
  if (!latest) {
    console.error('slack: there is no issue to post');
    process.exit(1);
  }
  text = issueMessage(config, latest.data);
} else if (mode === 'failure') {
  text = failureMessage(config, rest[0]);
} else {
  console.error('Usage: slack.mjs issue <file...> | latest | failure [run url]');
  process.exit(2);
}

if (dryRun) {
  console.log(text);
  process.exit(0);
}
if (mode === 'latest') console.log(`slack: test post text follows\n${text}\n`);
try {
  const result = await send(process.env.SLACK_WEBHOOK_URL, text);
  console.log(`slack: ${result.reason}`);
  if (!result.sent && requireWebhook) process.exit(1);
} catch (err) {
  console.error(`slack: ${err.message}`);
  process.exit(1);
}
