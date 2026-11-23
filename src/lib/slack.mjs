// Slack messages. Plain text through an incoming webhook.
// With no webhook URL the send is skipped and reported as such: it never throws.

import { formatDateLong } from './dates.mjs';

const LINE_LIMIT = 160;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * First sentence of a paragraph. Punctuation inside a protected name (a brand such as
 * "ChipsMore!" or a campaign name) never ends the sentence, and neither does punctuation
 * that is not followed by a space and a capital letter or digit.
 */
export function firstSentence(text, protectedNames = []) {
  let masked = String(text).trim();
  const names = protectedNames.filter((n) => typeof n === 'string' && n.length > 0);
  // Swap . ! ? inside protected names for a placeholder so they cannot end the sentence.
  names.forEach((name) => {
    const safe = name.replace(/[.!?]/g, '\u0000');
    masked = masked.replace(new RegExp(escapeRegExp(name), 'g'), safe);
  });
  const match = masked.match(/^.*?[.!?](?=\s+["'(]?[A-Z0-9]|$)/s);
  const sentence = match ? match[0] : masked;
  // Put the original text back: the mask is the same length as the name.
  return String(text).trim().slice(0, sentence.length).trim();
}

/** Cuts at a word boundary and adds "..." when the text is over the limit. */
export function capLine(text, limit = LINE_LIMIT) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 3);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:]+$/, '')}...`;
}

/** The one line for a campaign: its summary, or failing that the first sentence of "did". */
export function campaignLine(c) {
  const summary = typeof c.summary === 'string' ? c.summary.trim() : '';
  return capLine(summary || firstSentence(c.did, [c.brand, c.campaign]));
}

export function issueUrl(config, issue) {
  return `${config.url.replace(/\/+$/, '')}/issues/${issue.date}/`;
}

/** The issue's summary paragraph as one plain-text paragraph, or '' when there is none. */
export function summaryParagraph(issue) {
  const text = typeof issue?.summaryParagraph === 'string' ? issue.summaryParagraph : '';
  return text.replace(/\s+/g, ' ').trim();
}

export function issueMessage(config, issue) {
  const number = String(issue.number).padStart(2, '0');
  const lines = issue.campaigns.map(
    (c, i) => `${i + 1}. ${c.brand}, "${c.campaign}": ${campaignLine(c)}`,
  );
  const paragraph = summaryParagraph(issue);
  return [
    `${config.name}, Issue ${number} (${formatDateLong(issue.date)})`,
    '',
    ...lines,
    '',
    ...(paragraph ? [paragraph, ''] : []),
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
