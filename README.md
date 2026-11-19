# Campaign Spotlight

A fortnightly digest of standout marketing campaigns and product launches. Each issue features two or three campaigns: what they did, why it worked, and the idea worth stealing.

Site: https://youtrip-marketing.github.io/campaign-spotlight/

## How it works

```
Scheduled routine (AI, outside this repo)        GitHub Actions (no AI, in this repo)
  guard -> research -> score -> write JSON   ->    test -> validate -> build -> deploy -> Slack
  commits one issue file to main                   runs on every push to main
```

1. **Routine.** A scheduled Claude session runs the prompt in [`routine/PROMPT.md`](routine/PROMPT.md) every Monday. The guard lets it through every second Monday. It researches, scores candidates against the rubric, writes `content/issues/<date>.json`, rebuilds the registry and pushes to `main`. There is no approval step.
2. **Publish workflow.** [`.github/workflows/publish.yml`](.github/workflows/publish.yml) runs the unit tests, validates every issue, checks the source links of any issue added in the push, builds the static site and deploys it to GitHub Pages.
   A manual run from the Actions tab ("Run workflow") rebuilds and redeploys, with an option to recheck every source link.
   To send a test post, run the workflow by hand with "send_test_post" ticked (or `gh workflow run publish.yml -f send_test_post=true`). It posts the latest issue to Slack again and does not build or deploy.
3. **Slack.** If the push added a new issue, the workflow posts a short summary to Slack. If the run fails, it posts a short failure note. Both steps do nothing until the `SLACK_WEBHOOK_URL` repository secret is set.

The routine is the only part that uses AI, and it can be swapped for a person: anyone can write an issue file by hand and push it.

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

If only 2 campaigns clear the bar, the issue runs with 2. If 0 or 1 clear it, the routine writes no issue that fortnight.

## Schedule

Issues are dated on every second Monday, counted from `anchorMonday` in [`config/site.json`](config/site.json).

**The anchor is a placeholder: Monday 30 Nov 2026.** Change that one value to move the schedule. It must be a Monday.

The guard counts whole fortnights from the anchor instead of using ISO week numbers, because odd and even week numbers break at New Year (2026 has 53 weeks). A run up to two days late still files the issue under its Monday. A rerun is skipped once the issue file exists.

Issue 01 (19 Nov 2026) was a dry run written before the anchor date, so it sits outside the Monday rhythm.

## Run it locally

Node 20 or later. No dependencies to install.

```
npm test                  # unit tests
npm run guard             # is today an issue day?
npm run validate          # structure checks
npm run validate:links    # structure checks plus every source link
npm run registry          # rebuild content/registry.json from the issues
npm run build             # static site into dist/
node scripts/slack.mjs issue 2026-11-19.json --dry-run   # print the Slack message
```

To preview: `npm run build`, then serve `dist/` with any static server.

## Layout

```
config/site.json         site name, URL, anchor date, rubric thresholds
content/issues/          one JSON file per issue, named by date
content/registry.json    every campaign featured so far (generated)
routine/PROMPT.md        the prompt the scheduled routine runs
src/lib/                 schedule guard, validator, link checker, Slack message
src/templates.mjs        page HTML
src/styles.css           the one stylesheet
src/build.mjs            builds dist/
scripts/                 command line entry points
test/                    unit tests (node --test)
```

## Design notes

- **No framework.** The site is three page types built from template strings. A build with no dependencies cannot break on a package update, which matters for something that runs unattended.
- **The repo is the database.** Issues are JSON in git, so every change has a history and a rollback.
- **The registry is derived.** `content/registry.json` is rebuilt from the issue files and the validator checks it is in sync, so it cannot drift.
- **No third party images.** Each campaign gets a colour tile. The source links carry the visuals.
- **Not indexed.** Every page carries `noindex` and `robots.txt` disallows crawling.

## Set-up checklist

- [ ] Create the scheduled routine with the prompt in `routine/PROMPT.md`, weekly on Monday morning, with push access to this repository
- [ ] Create a Slack incoming webhook for the chosen channel and save it as the repository secret `SLACK_WEBHOOK_URL`
- [ ] Confirm `anchorMonday` in `config/site.json`
