import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";

async function block(start: string, end: string) {
  const source = await readFile("test/fixtures/files-packaged.cjs", "utf8");
  const from = source.indexOf(start),
    to = source.indexOf(end, from);
  assert.ok(from > 0 && to > from);
  return source.slice(from, to);
}
it.each([true, false])(
  "closes the source only for the macOS scenario=%s and preserves a distinct survivor",
  async (macosLifecycle) => {
    const code = await block(
      "    if (options.macosLifecycle)\n      await js",
      '    await panel(view, true, "core");\n    // Selected-visible entry closes',
    );
    const shell = { probePid: 11 };
    let selected = 22;
    const dead = new Set<number>();
    const js = vi.fn(async (expression: string) => {
      if (expression.includes("[0].click()")) selected = 11;
    });
    const run = new Function(
      "options",
      "shell",
      "processIdentity",
      "js",
      "menu",
      "until",
      "assert",
      `return (async () => {
    const secondPid = 22, secondIdentity = { pid: 22, start: 'second' };
    let identity = { pid: 11, start: 'first' }, sourceExited = false;
    const checks = [], tabCount = async () => 1;
    ${code}
    return { identity, sourceExited, checks };
  })();`,
    ) as (...args: unknown[]) => Promise<{
      identity: { pid: number };
      sourceExited: boolean;
      checks: string[];
    }>;
    const result = await run(
      { macosLifecycle },
      shell,
      { alive: (identity: { pid: number }) => !dead.has(identity.pid) },
      js,
      () => dead.add(selected),
      async (check: () => boolean | Promise<boolean>) =>
        assert.ok(await check()),
      assert,
    );
    expect(dead).toEqual(new Set([macosLifecycle ? 11 : 22]));
    expect(shell.probePid).toBe(macosLifecycle ? 22 : 11);
    expect(result.identity.pid).toBe(shell.probePid);
    expect(result.sourceExited).toBe(macosLifecycle);
    expect(result.checks).toHaveLength(macosLifecycle ? 1 : 0);
  },
);
it.each(
  [
    "active",
    "already-exited",
    "already-closed",
    "view-gone",
    "implicit-activation",
  ].flatMap((state) =>
    ["local", "link", "catalog"].map((acquisition) => ({ state, acquisition })),
  ),
)(
  "requires an actually live third generation before Quit: $state ($acquisition)",
  async ({ state, acquisition }) => {
    const code = await block(
      "  if (options.macosLifecycle || options.publicLink || options.publicCatalog) {\n    await settings();",
      "  if (catalogTransport) {\n    assert.deepEqual(catalogTransport.requests",
    );
    const run = new Function(
      "assert",
      "mode",
      "acquisition",
      `return (async () => {
    const options = { macosLifecycle: acquisition === 'local', publicLink: acquisition === 'link', publicCatalog: acquisition === 'catalog' }, checks = [];
    const core = {}, children = [{}, {}]; let view, approvals = 2;
    const settings = async () => {};
    const installArchive = async () => { approvals++; if (mode === 'implicit-activation') children.push({}); };
    const state = async value => assert.equal(value, 'generation 6');
    const openFiles = async () => { children.push({ exit: mode === 'already-exited' ? {code: 0} : null, closed: mode === 'already-closed' }); return { isDestroyed: () => mode === 'view-gone' }; };
    ${code}
    return checks;
  })();`,
    ) as (
      assertion: typeof assert,
      state: string,
      acquisition: string,
    ) => Promise<string[]>;
    if (state === "active")
      await expect(run(assert, state, acquisition)).resolves.toEqual([
        "third-consent-active-Files-at-Quit",
      ]);
    else await expect(run(assert, state, acquisition)).rejects.toThrow();
  },
);
