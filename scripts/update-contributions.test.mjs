import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchContributions, selectContributions, renderContributions, updateReadme } from './update-contributions.mjs';

function pr(repo, day, extra = {}) {
  return {
    title: 'Fix an issue', url: `https://github.com/${repo}/pull/${day}`,
    mergedAt: `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`,
    author: { login: 'joshcazalas' },
    repository: { nameWithOwner: repo, isPrivate: false, owner: { login: repo.split('/')[0] } },
    ...extra,
  };
}

test('selects five distinct upstream projects by merge time, regardless of input order', () => {
  const input = [pr('org/a', 1), pr('org/b', 8), pr('org/a', 9),
    pr('org/c', 7), pr('org/d', 6), pr('org/e', 5), pr('org/f', 4),
    pr('joshcazalas/own', 30), pr('org/open', 29, { mergedAt: null }),
    pr('org/private', 28, { repository: { nameWithOwner: 'org/private', isPrivate: true, owner: { login: 'org' } } }),
    pr('org/other-author', 27, { author: { login: 'someone-else' } })];
  const selected = selectContributions(input);
  assert.deepEqual(selected.map(p => p.repository.nameWithOwner), ['org/a', 'org/b', 'org/c', 'org/d', 'org/e']);
  assert.equal(selected[0].url, 'https://github.com/org/a/pull/9');
});

test('escapes PR titles without allowing Markdown, HTML, or table injection', () => {
  const output = renderContributions([pr('org/repo', 1, { title: 'Fix | [link](bad) <img>\n`code` & stuff' })]);
  assert.ok(output.includes('Fix &#124; \\[link\\](bad) &lt;img&gt; \\`code\\` &amp; stuff'));
  assert.equal(output.split('\n').length, 5);
});

test('updates only the marked section and is stable on repeat runs', () => {
  const before = 'Personal intro\n<!-- contributions:start -->\nold\n<!-- contributions:end -->\nPersonal footer\n';
  const after = updateReadme(before, 'new table');
  assert.equal(after, before.replace('old', 'new table'));
  assert.equal(updateReadme(after, 'new table'), after);
  assert.throws(() => updateReadme('no markers', 'table'));
  assert.throws(() => updateReadme(before + '<!-- contributions:start -->', 'table'));
  assert.throws(() => renderContributions([]));
});

test('fetches every page before selecting projects', async () => {
  const cursors = [];
  const result = await fetchContributions('test-token', async (_url, options) => {
    const cursor = JSON.parse(options.body).variables.cursor;
    cursors.push(cursor);
    return { ok: true, json: async () => ({ data: { search: {
      issueCount: 2, nodes: [pr(cursor ? 'org/b' : 'org/a', 1)],
      pageInfo: { hasNextPage: !cursor, endCursor: cursor ? 'last' : 'next' },
    } } }) };
  });
  assert.deepEqual(cursors, [null, 'next']);
  assert.equal(result.length, 2);
});

test('fails closed on API errors, missing data, and search limits', async () => {
  await assert.rejects(fetchContributions(''), /GH_TOKEN/);
  await assert.rejects(fetchContributions('token', async () => ({ ok: false, status: 403 })), /403/);
  for (const response of [
    { errors: [{ message: 'Rate limited' }] },
    { data: {} },
    { data: { search: { issueCount: 1001, nodes: [], pageInfo: {} } } },
    { data: { search: { issueCount: 1, nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } } },
  ]) {
    await assert.rejects(fetchContributions('token', async () => ({ ok: true, json: async () => response })));
  }
});
