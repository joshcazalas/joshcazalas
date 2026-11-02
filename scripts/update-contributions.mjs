import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const USERNAME = 'joshcazalas';
const START = '<!-- contributions:start -->';
const END = '<!-- contributions:end -->';
const SEARCH = `is:pr is:merged is:public author:${USERNAME} -user:${USERNAME}`;
const QUERY = `query Contributions($query: String!, $cursor: String) {
  search(query: $query, type: ISSUE, first: 100, after: $cursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        title url mergedAt
        author { login }
        repository { nameWithOwner isPrivate owner { login } }
      }
    }
  }
}`;

export async function fetchContributions(token, request = fetch) {
  if (!token) throw new Error('Set GH_TOKEN to a GitHub API token.');
  const contributions = [];
  let cursor = null;
  do {
    const response = await request('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'joshcazalas-profile',
      },
      body: JSON.stringify({ query: QUERY, variables: { query: SEARCH, cursor } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}.`);
    const result = await response.json();
    if (result.errors?.length) throw new Error('GitHub GraphQL query failed. README unchanged.');
    const search = result.data?.search;
    if (!search || !Array.isArray(search.nodes) || !search.pageInfo ||
        !Number.isInteger(search.issueCount)) {
      throw new Error('Unexpected GitHub response. README unchanged.');
    }
    // GitHub search exposes at most 1,000 results. Refuse a partial ranking.
    if (search.issueCount > 1000) {
      throw new Error('More than 1,000 merged PRs: partition the search before refreshing.');
    }
    contributions.push(...search.nodes);
    const next = search.pageInfo.hasNextPage ? search.pageInfo.endCursor : null;
    if (search.pageInfo.hasNextPage && (!next || next === cursor)) {
      throw new Error('Invalid GitHub pagination. README unchanged.');
    }
    cursor = next;
  } while (cursor);
  return contributions;
}

export function selectContributions(contributions, limit = 5) {
  const eligible = contributions.filter(pr =>
    pr?.mergedAt && Number.isFinite(Date.parse(pr.mergedAt)) &&
    pr.author?.login?.toLowerCase() === USERNAME &&
    pr.repository?.isPrivate === false &&
    pr.repository.owner?.login?.toLowerCase() !== USERNAME &&
    /^[\w.-]+\/[\w.-]+$/.test(pr.repository.nameWithOwner) &&
    typeof pr.title === 'string' &&
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(pr.url)
  ).sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt) || a.url.localeCompare(b.url));
  const projects = new Set();
  return eligible.filter(pr => {
    const project = pr.repository.nameWithOwner.toLowerCase();
    if (projects.has(project)) return false;
    projects.add(project);
    return true;
  }).slice(0, limit);
}

export function escapeMarkdown(value) {
  return value.replace(/\s+/g, ' ').trim()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\').replace(/([`*_\[\]])/g, '\\$1').replace(/\|/g, '&#124;');
}

export function renderContributions(contributions) {
  if (!contributions.length) throw new Error('No eligible merged PRs found. README unchanged.');
  const rows = contributions.map(pr => {
    const repo = pr.repository.nameWithOwner;
    return `| [${escapeMarkdown(repo)}](https://github.com/${repo}) | [${escapeMarkdown(pr.title)}](${pr.url}) | ${pr.mergedAt.slice(0, 10)} |`;
  });
  return [
    '| Project | Latest merged contribution | Merged |',
    '| --- | --- | --- |',
    ...rows,
    '',
    `[All merged contributions](https://github.com/search?q=${encodeURIComponent(SEARCH)}&type=pullrequests)`,
  ].join('\n');
}

export function updateReadme(readme, table) {
  if (readme.split(START).length !== 2 || readme.split(END).length !== 2 ||
      readme.indexOf(START) >= readme.indexOf(END)) {
    throw new Error('README must contain exactly one ordered pair of contribution markers.');
  }
  return readme.slice(0, readme.indexOf(START) + START.length) +
    `\n${table}\n` + readme.slice(readme.indexOf(END));
}

async function main() {
  const path = new URL('../README.md', import.meta.url);
  const current = await readFile(path, 'utf8');
  const contributions = selectContributions(await fetchContributions(process.env.GH_TOKEN));
  const updated = updateReadme(current, renderContributions(contributions));
  if (updated === current) {
    console.log('Contributions unchanged.');
    return;
  }
  await writeFile(path, updated);
  console.log(`Updated contributions for ${contributions.length} projects.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
