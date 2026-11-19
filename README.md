# Campaign Spotlight

A digest of standout marketing campaigns and product launches. Each issue features two or three campaigns: what they did, why it worked, and the idea worth stealing.

Site: https://youtrip-marketing.github.io/campaign-spotlight/

## How it works

```
Editor (AI or a person, outside this repo)       GitHub Actions (no AI, in this repo)
  check -> research -> score -> write JSON   ->    test -> validate -> build -> deploy -> Slack
  commits one issue file to main                   runs on every push to main
```

1. **Editor.** Whoever wants an issue out runs the prompt in [`ISSUE-PROMPT.md`](ISSUE-PROMPT.md), for example in a Claude Code session with this repository checked out. It researches, scores candidates against the rubric, writes `content/issues/<date>.json`, rebuilds the registry and pushes to `main`. There is no schedule and no approval step.
2. **Publish workflow.** [`.github/workflows/publish.yml`](.github/workflows/publish.yml) runs the unit tests, validates every issue, checks the source links of any issue added in the push, builds the static site and deploys it to GitHub Pages.
   A manual run from the Actions tab ("Run workflow") rebuilds and redeploys, with an option to recheck every source link.
   To send a test post, run the workflow by hand with "send_test_post" ticked (or `gh workflow run publish.yml -f send_test_post=true`). It posts the latest issue to Slack again and does not build or deploy. It fails with a clear message when the secret is not set.
3. **Slack.** Slack posting is off unless the `SLACK_WEBHOOK_URL` repository secret is set. With it set, a push that adds a new issue posts a short summary and a failed run posts a short note. Without it, `npm run slack-message` prints the same summary for the latest issue, ready to paste by hand.

The editor step is the only part that uses AI, and it can be done by a person: anyone can write an issue file by hand and push it.

## What stops a bad issue

Validation fails, and nothing is deployed or posted, when:

- a campaign has fewer than 2 sources, or all its sources are on one publication
- a source link is dead (404, 410, host not found), or fewer than 2 of a campaign's links can be confirmed working
- a campaign, or a source link, already appeared in an earlier issue
- a score total is under 14 of 20, or Originality is under 4
- a campaign is older than the issue's window (14 or 28 days)
- an issue has fewer than 2 or more than 3 campaigns
- copy is missing, over length, or contains an em dash or en dash
- the file name, date and issue number disagree, or `content/registry.json` is out of date

Sites that refuse automated requests (HTTP 401, 403, 429, 5xx, timeouts) are reported as warnings. They do not fail an issue on their own, but they do not count towards the 2 working links.

If only 2 campaigns clear the bar, the issue runs with 2. If 0 or 1 clear it, no issue is written.

## When issues go out

On demand. An issue is dated the day it is written, in Singapore time whatever clock the machine runs on, and numbered next in sequence. `npm run next-issue` reports the date, number and recency windows (14 days back from today, widening to 28), and refuses a second issue on the same day.

## Run it locally

Node 20 or later. No dependencies to install.

```
npm test                  # unit tests
npm run next-issue        # date, number and windows for an issue written today
npm run validate          # structure checks
npm run validate:links    # structure checks plus every source link
npm run registry          # rebuild content/registry.json from the issues
npm run build             # static site into dist/
npm run slack-message     # print the Slack message for the latest issue, nothing is sent
```

To preview: `npm run build`, then serve `dist/` with any static server.

## Layout

```
config/site.json         site name, URL, timezone, rubric thresholds
content/issues/          one JSON file per issue, named by date
content/registry.json    every campaign featured so far (generated)
ISSUE-PROMPT.md          the prompt for researching and writing an issue
src/lib/                 dates, validator, link checker, Slack message
src/templates.mjs        page HTML
src/styles.css           the one stylesheet
src/build.mjs            builds dist/
scripts/                 command line entry points
test/                    unit tests (node --test)
```

## Design notes

- **No framework.** The site is three page types built from template strings. A build with no dependencies cannot break on a package update, which matters for something nobody babysits.
- **The repo is the database.** Issues are JSON in git, so every change has a history and a rollback.
- **The registry is derived.** `content/registry.json` is rebuilt from the issue files and the validator checks it is in sync, so it cannot drift.
- **No third party images.** Each campaign gets a colour tile. The source links carry the visuals.
- **Not indexed.** Every page carries `noindex` and `robots.txt` disallows crawling.
