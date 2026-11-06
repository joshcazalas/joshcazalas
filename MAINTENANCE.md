# Profile maintenance

The profile README was removed and the updater workflow disabled on 2026-11-06.
The code and previous README remain in Git history if this is revisited. The
notes below describe the former setup; restore the README before re-enabling it.

The root README appears on the GitHub profile. Edit freely outside the
`<!-- contributions:start -->` and `<!-- contributions:end -->` comments.
The content between those comments is generated.

The updater finds public merged PRs authored by `joshcazalas`, excludes repos
owned by that account, and shows the five repositories with the most recent
merges. Each repository appears once, with its latest merged PR. Dates are UTC.
PR titles are used directly, with Markdown escaping; there are no generated
summaries or significance rankings.

The workflow runs daily at 09:17 UTC, when relevant files change on `main`, or
through **Actions → Update contributions → Run workflow**. GitHub may delay
scheduled runs. Only changed README content produces a commit. API errors and
empty results fail the run without replacing the existing table.

Authentication uses GitHub's automatic, temporary `GITHUB_TOKEN` with
`contents: write` for this repository. No personal access token or custom secret
is needed. The script uses Node 24 with no npm dependencies. Official GitHub
actions are pinned to commit IDs; update the IDs when upgrading those actions.

GitHub can disable schedules after 60 days without repository activity. If that
happens, re-enable the workflow from the Actions tab. The existing README remains
visible. See [GitHub's scheduling documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Run checks locally:

```sh
node --test scripts/update-contributions.test.mjs
```

Refresh locally using an authenticated GitHub CLI:

```sh
GH_TOKEN="$(gh auth token)" node scripts/update-contributions.mjs
```

GitHub search returns at most 1,000 results. The script intentionally stops if
the account exceeds 1,000 matching merged PRs, rather than displaying a partial
ranking. At that point, partition the search by merge date before resuming.
