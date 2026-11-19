// Source link checks. Every link in a new issue is requested once (twice on a soft failure).
//
// ok       2xx after redirects. Counts as a working source.
// dead     404, 410, any other 4xx that is not a bot wall, or the host does not exist. Fails the issue.
// blocked  401, 403, 429, 5xx, timeout or dropped connection. The site refused an automated
//          request, so the link cannot be confirmed either way. Does not fail the issue on its
//          own, but does not count towards the 2 working sources each campaign needs.

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BLOCKED_STATUS = new Set([401, 403, 429]);
const DEAD_ERROR_CODES = new Set(['ENOTFOUND', 'EAI_NONAME', 'ERR_INVALID_URL']);

export function classifyStatus(status) {
  if (status >= 200 && status < 300) return 'ok';
  if (BLOCKED_STATUS.has(status) || status >= 500) return 'blocked';
  return 'dead';
}

export function classifyError(err) {
  const code = err?.cause?.code ?? err?.code ?? '';
  return DEAD_ERROR_CODES.has(code) ? 'dead' : 'blocked';
}

async function requestOnce(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
      },
    });
    await res.body?.cancel?.().catch(() => {});
    return { state: classifyStatus(res.status), detail: `HTTP ${res.status}` };
  } catch (err) {
    const code = err?.cause?.code ?? err?.code ?? err?.name ?? 'error';
    return { state: classifyError(err), detail: String(code) };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkLink(url, { fetchImpl = fetch, timeoutMs = 20_000, retries = 1 } = {}) {
  let result = await requestOnce(url, fetchImpl, timeoutMs);
  for (let i = 0; i < retries && result.state === 'blocked'; i += 1) {
    result = await requestOnce(url, fetchImpl, timeoutMs);
  }
  return { url, ...result };
}

/**
 * Checks every source link of one issue.
 * @returns { errors: string[], warnings: string[], results: [...] }
 */
export async function checkIssueLinks(file, issue, options = {}) {
  const errors = [];
  const warnings = [];
  const results = [];
  const campaigns = Array.isArray(issue?.campaigns) ? issue.campaigns : [];

  for (const [i, c] of campaigns.entries()) {
    const where = `issues/${file}.campaigns[${i}]`;
    const sources = Array.isArray(c?.sources) ? c.sources : [];
    const checked = await Promise.all(sources.map((s) => checkLink(s.url, options)));
    results.push(...checked);

    for (const r of checked) {
      if (r.state === 'dead') errors.push(`${where}: dead link ${r.url} (${r.detail})`);
      if (r.state === 'blocked') warnings.push(`${where}: could not confirm ${r.url} (${r.detail})`);
    }
    const working = checked.filter((r) => r.state === 'ok').length;
    if (working < 2) {
      errors.push(`${where}: ${working} of ${checked.length} source links confirmed working, needs 2`);
    }
  }
  return { errors, warnings, results };
}
