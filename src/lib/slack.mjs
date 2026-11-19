// Slack messages. Plain text through an incoming webhook.
// With no webhook URL the send is skipped and reported as such: it never throws.

import { formatDateLong } from './schedule.mjs';

function firstSentence(text) {
  const match = String(text).match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : String(text)).trim();
}

export function issueUrl(config, issue) {
  return `${config.url.replace(/\/+$/, '')}/issues/${issue.date}/`;
}

export function issueMessage(config, issue) {
  const number = String(issue.number).padStart(2, '0');
  const lines = issue.campaigns.map(
    (c, i) => `${i + 1}. ${c.brand}, "${c.campaign}": ${firstSentence(c.did)}`,
  );
  return [
    `${config.name}, Issue ${number} (${formatDateLong(issue.date)})`,
    '',
    ...lines,
    '',
    `Read the issue: ${issueUrl(config, issue)}`,
  ].join('\n');
}

export function failureMessage(config, runUrl) {
  return [
    `${config.name}: this run did not publish.`,
    'The checks failed, so the site was not updated and no issue was posted.',
    runUrl ? `Details: ${runUrl}` : '',
  ].filter(Boolean).join('\n');
}

/** @returns {{ sent: boolean, reason: string }} */
export async function send(webhookUrl, text, fetchImpl = fetch) {
  if (!webhookUrl || webhookUrl.trim() === '') {
    return { sent: false, reason: 'SLACK_WEBHOOK_URL is not set, skipped' };
  }
  const res = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Slack returned HTTP ${res.status}`);
  return { sent: true, reason: `posted, Slack returned HTTP ${res.status}` };
}
