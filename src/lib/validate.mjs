// Structural validation of issues and the registry. Pure functions, no network or disk.
// Link checking lives in links.mjs.

import { isIsoDate, daysBetween } from './dates.mjs';

const LIMITS = {
  headline: 90, brand: 40, campaign: 44, category: 24, market: 28,
  tag: 18, summary: 140, did: 420, why: 300, steal: 260, sourceLabel: 40,
};
const SCORE_KEYS = ['originality', 'craft', 'proof', 'stealable'];
const BANNED_CHARS = [
  ['\u2014', 'an em dash'],
  ['\u2013', 'an en dash'],
];

/** Lower-case, strip accents and punctuation. Used to spot repeats. */
export function normalise(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function campaignKey(brand, campaign) {
  return `${normalise(brand)}|${normalise(campaign)}`;
}

/** Host without a leading "www." */
export function hostOf(url) {
  return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
}

/** Same page regardless of trailing slash, fragment or tracking parameters. */
export function canonicalUrl(url) {
  const u = new URL(url);
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) u.searchParams.delete(key);
  }
  const path = u.pathname.replace(/\/+$/, '');
  const query = u.searchParams.toString();
  return `${hostOf(url)}${path}${query ? `?${query}` : ''}`;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function checkText(errors, where, value, max) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${where}: required text is missing`);
    return;
  }
  if (value !== value.trim()) errors.push(`${where}: has leading or trailing spaces`);
  if (value.length > max) errors.push(`${where}: ${value.length} characters, limit is ${max}`);
  for (const [char, name] of BANNED_CHARS) {
    if (value.includes(char)) errors.push(`${where}: contains ${name}`);
  }
}

function validateCampaign(errors, where, c, issueDate, windowDays, config) {
  if (c === null || typeof c !== 'object') {
    errors.push(`${where}: must be an object`);
    return;
  }
  for (const key of ['brand', 'campaign', 'category', 'market', 'summary', 'did', 'why', 'steal']) {
    checkText(errors, `${where}.${key}`, c[key], LIMITS[key]);
  }

  // The summary is the line shown after the brand and campaign name, so it must not repeat them.
  if (typeof c.summary === 'string') {
    const summary = ` ${normalise(c.summary)} `;
    for (const key of ['brand', 'campaign']) {
      const name = typeof c[key] === 'string' ? normalise(c[key]) : '';
      if (name && summary.includes(` ${name} `)) {
        errors.push(`${where}.summary: repeats the ${key} name "${c[key]}"`);
      }
    }
    if (c.summary.trim() !== '' && !/[.!?]$/.test(c.summary.trim())) {
      errors.push(`${where}.summary: must be one full sentence ending in a full stop`);
    }
  }

  if (!Array.isArray(c.tags) || c.tags.length < 1 || c.tags.length > 3) {
    errors.push(`${where}.tags: needs 1 to 3 tags`);
  } else {
    c.tags.forEach((tag, i) => checkText(errors, `${where}.tags[${i}]`, tag, LIMITS.tag));
  }

  for (const key of ['launched', 'peaked']) {
    if (key === 'peaked' && c.peaked === undefined) continue;
    if (!isIsoDate(c[key])) errors.push(`${where}.${key}: must be a YYYY-MM-DD date`);
  }
  if (isIsoDate(c.launched) && isIsoDate(c.peaked) && daysBetween(c.launched, c.peaked) < 0) {
    errors.push(`${where}.peaked: is before launched`);
  }
  const recencyDate = c.peaked ?? c.launched;
  if (isIsoDate(recencyDate) && isIsoDate(issueDate) && Number.isInteger(windowDays)) {
    const age = daysBetween(recencyDate, issueDate);
    if (age < 0) errors.push(`${where}: ${recencyDate} is after the issue date`);
    if (age > windowDays) {
      errors.push(`${where}: ${recencyDate} is ${age} days before the issue date, window is ${windowDays} days`);
    }
  }

  const s = c.scores;
  if (s === null || typeof s !== 'object') {
    errors.push(`${where}.scores: missing`);
  } else {
    let total = 0;
    let complete = true;
    for (const key of SCORE_KEYS) {
      if (!Number.isInteger(s[key]) || s[key] < 1 || s[key] > 5) {
        errors.push(`${where}.scores.${key}: must be a whole number from 1 to 5`);
        complete = false;
      } else {
        total += s[key];
      }
    }
    if (complete) {
      if (total < config.minTotalScore) {
        errors.push(`${where}.scores: total ${total} is below the bar of ${config.minTotalScore}`);
      }
      if (s.originality < config.minOriginality) {
        errors.push(`${where}.scores.originality: ${s.originality} is below the bar of ${config.minOriginality}`);
      }
    }
  }

  if (!Array.isArray(c.sources) || c.sources.length < 2) {
    errors.push(`${where}.sources: needs at least 2 sources`);
  } else {
    const hosts = new Set();
    c.sources.forEach((src, i) => {
      const at = `${where}.sources[${i}]`;
      checkText(errors, `${at}.label`, src?.label, LIMITS.sourceLabel);
      if (!isHttpsUrl(src?.url)) {
        errors.push(`${at}.url: must be an https link`);
      } else {
        hosts.add(hostOf(src.url));
      }
    });
    if (hosts.size < 2 && c.sources.every((src) => isHttpsUrl(src?.url))) {
      errors.push(`${where}.sources: needs 2 different publications, all links are on ${[...hosts][0]}`);
    }
  }
}

/**
 * @param issues   [{ file, data }] every issue in the repo
 * @param registry { campaigns: [...] }
 * @param config   config/site.json
 * @returns string[] of problems. Empty means valid.
 */
export function validateAll(issues, registry, config) {
  const errors = [];
  const sorted = [...issues].sort((a, b) => a.file.localeCompare(b.file));
  const seenKeys = new Map();
  const seenUrls = new Map();

  sorted.forEach(({ file, data }, index) => {
    const where = `issues/${file}`;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      errors.push(`${where}: must be a JSON object`);
      return;
    }
    const expectedDate = file.replace(/\.json$/, '');
    if (!isIsoDate(expectedDate)) errors.push(`${where}: file name must be YYYY-MM-DD.json`);
    if (data.date !== expectedDate) errors.push(`${where}: date "${data.date}" does not match the file name`);
    if (data.number !== index + 1) {
      errors.push(`${where}: number is ${data.number}, expected ${index + 1} (issues are numbered in date order)`);
    }
    checkText(errors, `${where}.headline`, data.headline, LIMITS.headline);
    if (!config.windowDays.includes(data.windowDays)) {
      errors.push(`${where}.windowDays: must be one of ${config.windowDays.join(', ')}`);
    }

    const list = data.campaigns;
    if (!Array.isArray(list) || list.length < config.minCampaigns || list.length > config.maxCampaigns) {
      errors.push(`${where}.campaigns: needs ${config.minCampaigns} to ${config.maxCampaigns} campaigns`);
      return;
    }

    list.forEach((c, i) => {
      const at = `${where}.campaigns[${i}]`;
      validateCampaign(errors, at, c, data.date, data.windowDays, config);
      if (!c || typeof c.brand !== 'string' || typeof c.campaign !== 'string') return;

      const key = campaignKey(c.brand, c.campaign);
      if (seenKeys.has(key)) {
        errors.push(`${at}: repeat. "${c.brand}, ${c.campaign}" already ran in ${seenKeys.get(key)}`);
      } else {
        seenKeys.set(key, where);
      }
      for (const src of Array.isArray(c.sources) ? c.sources : []) {
        if (!isHttpsUrl(src?.url)) continue;
        const canon = canonicalUrl(src.url);
        const prior = seenUrls.get(canon);
        if (prior && prior !== where) {
          errors.push(`${at}: repeat. Source ${src.url} was already used in ${prior}`);
        } else {
          seenUrls.set(canon, where);
        }
      }
    });

    if (list.length === 3) {
      const counts = new Map();
      for (const c of list) {
        const cat = normalise(c?.category ?? '');
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
      for (const [cat, n] of counts) {
        if (n > 2) errors.push(`${where}.campaigns: all three are in the "${cat}" category, limit is 2`);
      }
    }
  });

  const expected = JSON.stringify(buildRegistry(sorted));
  if (JSON.stringify(registry) !== expected) {
    errors.push('content/registry.json: out of date. Run "npm run registry" and commit the result');
  }
  return errors;
}

/** The registry is derived from the issue files: every campaign ever featured. */
export function buildRegistry(issues) {
  const campaigns = [];
  for (const { data } of [...issues].sort((a, b) => a.file.localeCompare(b.file))) {
    for (const c of Array.isArray(data?.campaigns) ? data.campaigns : []) {
      campaigns.push({
        issue: data.date,
        brand: c.brand,
        campaign: c.campaign,
        key: campaignKey(c.brand ?? '', c.campaign ?? ''),
        sources: (Array.isArray(c.sources) ? c.sources : []).map((s) => s.url),
      });
    }
  }
  return { campaigns };
}
