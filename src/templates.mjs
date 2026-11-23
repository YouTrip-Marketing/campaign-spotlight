// HTML for every page. Plain template strings, all content escaped.

import { formatDate, formatDateLong } from './lib/dates.mjs';

const RAIL_SIZE = 4;

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const pad = (n) => String(n).padStart(2, '0');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function nameSize(name) {
  const longestWord = Math.max(...name.split(/\s+/).map((w) => w.length));
  if (name.length > 26 || longestWord > 12) return ' s';
  if (name.length > 15 || longestWord > 9) return ' m';
  return '';
}

function page({ site, title, root, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${root}styles.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230C0C0D'/%3E%3Ccircle cx='16' cy='16' r='8' fill='%23E6FF3F'/%3E%3C/svg%3E">
</head>
<body>
<div class="wrap">

  <header class="top">
    <a class="mark" href="${root}">${markHtml(site.name)}</a>
  </header>
${body}
</div>
</body>
</html>
`;
}

/** Last word of the site name takes the accent colour. */
function markHtml(name) {
  const words = name.trim().split(/\s+/);
  const last = words.pop();
  return `${esc(words.join(' '))}${words.length ? ' ' : ''}<i>${esc(last)}</i>`;
}

function rail(issues, root, current) {
  const latestFirst = [...issues].reverse().slice(0, RAIL_SIZE);
  const pills = latestFirst.map((issue) => {
    const on = current === issue.date ? ' class="on" aria-current="page"' : '';
    return `    <a${on} href="${root}issues/${issue.date}/"><b>${pad(issue.number)}</b>${esc(formatDate(issue.date))}</a>`;
  });
  const allOn = current === 'archive' ? ' on" aria-current="page' : '';
  pills.push(`    <a class="all${allOn}" href="${root}issues/">All issues &rarr;</a>`);
  return `  <nav class="rail mono" aria-label="Issues">\n${pills.join('\n')}\n  </nav>`;
}

function foot(site, root) {
  return `  <footer class="foot mono">
    <span>${esc(site.name)}</span>
    <a href="${root}issues/">All issues &rarr;</a>
  </footer>`;
}

function card(c, slot) {
  const tags = c.tags.map((t) => `<span>${esc(t)}</span>`).join('');
  const sources = c.sources
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`)
    .join('');
  return `    <article class="card">
      <div class="poster p${slot}">
        <div class="row1 mono"><span class="n">${slot}</span><span class="where">${esc(c.category)} &middot; ${esc(c.market)}</span></div>
        <div><h2 class="name${nameSize(c.campaign)}">${esc(c.campaign)}</h2><div class="brand">${esc(c.brand)}</div></div>
      </div>
      <div class="inner">
        <div class="tags mono">${tags}</div>
        <div class="blk"><h3 class="mono">What they did</h3><p>${esc(c.did)}</p></div>
        <div class="blk"><h3 class="mono">Why it worked</h3><p>${esc(c.why)}</p></div>
        <div class="steal s${slot}"><h3 class="mono">Steal it</h3><p>${esc(c.steal)}</p></div>
        <div class="src mono"><span>Sources</span>${sources}</div>
      </div>
    </article>`;
}

/** Short prose summary under the posters. Nothing when the issue has none. */
function inShort(issue) {
  const text = typeof issue.summaryParagraph === 'string' ? issue.summaryParagraph.trim() : '';
  if (!text) return '';
  return `
  <section class="short" aria-labelledby="short-h">
    <h2 id="short-h" class="mono">This issue in short</h2>
    <p>${esc(text)}</p>
  </section>
`;
}

export function issuePage({ site, issues, issue, root }) {
  const cards = issue.campaigns.map((c, i) => card(c, i + 1)).join('\n\n');
  const body = `
${rail(issues, root, issue.date)}

  <section class="hero">
    <div class="big">${pad(issue.number)}</div>
    <div class="info">
      <div class="date mono">${esc(formatDateLong(issue.date))} &middot; ${plural(issue.campaigns.length, 'campaign')}</div>
      <h1>${esc(issue.headline)}</h1>
    </div>
  </section>

  <section class="grid${issue.campaigns.length === 2 ? ' two' : ''}">

${cards}

  </section>
${inShort(issue)}
${foot(site, root)}
`;
  return page({ site, root, body, title: `${site.name} · Issue ${pad(issue.number)}` });
}

export function archivePage({ site, issues, root }) {
  const rows = [...issues].reverse().map((issue) => {
    const chips = issue.campaigns
      .map((c, i) => `<span class="p${i + 1}">${esc(c.brand)} <em>${esc(c.campaign)}</em></span>`)
      .join('');
    return `    <a class="row" href="${root}issues/${issue.date}/">
      <div class="num">${pad(issue.number)}</div>
      <div>
        <div class="date mono">${esc(formatDateLong(issue.date))} &middot; ${plural(issue.campaigns.length, 'campaign')}</div>
        <h2>${esc(issue.headline)}</h2>
        <div class="chips">${chips}</div>
      </div>
    </a>`;
  });
  const body = `
${rail(issues, root, 'archive')}

  <section class="arch-head">
    <h1>All issues</h1>
    <div class="count mono">${plural(issues.length, 'issue')}</div>
  </section>

${rows.length ? `  <section class="list">\n${rows.join('\n')}\n  </section>` : '  <section class="list none mono">No issues yet</section>'}

${foot(site, root)}
`;
  return page({ site, root, body, title: `${site.name} · All issues` });
}

export function emptyPage({ site, root }) {
  const body = `
${rail([], root, null)}

  <section class="hero first">
    <div class="big">00</div>
    <div class="info"><div class="date mono">No issues yet</div></div>
  </section>
`;
  return page({ site, root, body, title: site.name });
}

export function notFoundPage({ site, siteUrl }) {
  const home = esc(siteUrl);
  const body = `
  <section class="lost">
    <h1>404</h1>
    <a class="mono" href="${home}">Latest issue &rarr;</a>
  </section>
`;
  // Absolute paths: GitHub Pages serves this file for any missing URL, at any depth.
  return page({ site, root: home, body, title: `${site.name} · 404` });
}
