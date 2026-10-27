import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, type BuildOptions } from "esbuild";
import { expect, it } from "vitest";

it("keeps the real ESM namespace behind the CJS spawn hook and supplied spawn native-free", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-pty-loader-"));
  try {
    const fakePackage = path.join(root, "node_modules/node-pty");
    await mkdir(fakePackage, { recursive: true });
    await writeFile(
      path.join(fakePackage, "package.json"),
      JSON.stringify({ name: "node-pty", main: "index.cjs" }),
    );
    await writeFile(
      path.join(fakePackage, "index.cjs"),
      `
      globalThis.packageLoads = (globalThis.packageLoads ?? 0) + 1;
      exports.spawn = (...args) => {
        globalThis.nativeCalls.push(args);
        const listeners = [];
        return { pid: 1234,
          onExit(listener) { listeners.push(listener); return { dispose() {} }; },
          removeListener() {},
          exit() { for (const listener of listeners) listener({exitCode: 0, signal: 0}); }
        };
      };
    `,
    );
    // Emit the real adapter as ESM with its dependency external, exactly where
    // the old named import froze CJS exports. Substitute only OS ownership.
    const options: BuildOptions = {
      absWorkingDir: fileURLToPath(new URL("../..", import.meta.url)),
      entryPoints: ["test/fixtures/native-fixture-pty.ts"],
      outfile: path.join(root, "adapter.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
      external: ["node-pty"],
      logLevel: "silent",
      plugins: [
        {
          name: "no-process-inventory",
          setup(builder) {
            builder.onResolve(
              { filter: /^\.\/native-fixture-ownership$/ },
              () => ({ path: "ownership", namespace: "controlled" }),
            );
            builder.onLoad(
              { filter: /^ownership$/, namespace: "controlled" },
              () => ({
                contents: `
          export function spawnFixtureProcess(spawn, observe, registered) {
            const terminal = spawn();
            observe?.(terminal, () => {}, () => true, () => {});
            registered?.(terminal);
            return terminal;
          }
        `,
              }),
            );
          },
        },
      ],
    };
    await build(options);
    // Other existing fixture entries emit CJS; retain that loading shape too.
    await build({
      ...options,
      format: "cjs",
      outfile: path.join(root, "adapter.cjs"),
    });
    expect(
      await readFile(path.join(root, "adapter.mjs"), "utf8"),
    ).not.toContain("function fixtureProcesses");
    await writeFile(
      path.join(root, "production.mjs"),
      `
      import * as nodePty from 'node-pty';
      export const spawn = nodePty.spawn;
    `,
    );
    await writeFile(
      path.join(root, "runner.mjs"),
      `
      import assert from 'node:assert/strict';
      import { createRequire, syncBuiltinESMExports } from 'node:module';
      import path from 'node:path';
      const require = createRequire(import.meta.url);
      const Module = require('node:module');
      Module._extensions['.node'] = () => { throw Error('Native addons forbidden'); };
      const commands = require('node:child_process');
      for (const name of ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork'])
        commands[name] = () => { throw Error('Process/inventory commands forbidden'); };
      syncBuiltinESMExports();
      assert.equal(require.resolve('node-pty'), path.join(import.meta.dirname, 'node_modules/node-pty/index.cjs'));
      globalThis.nativeCalls = [];
      const { spawnFixturePty } = await import('./adapter.mjs');
      const arguments_ = ['never-run.exe', ['--literal', 'two words'], {cols: 80, rows: 24}];
      let suppliedCalls = 0;
      const supplied = {pid: 12, onExit() { return {dispose() {}}; }, removeListener() {}};
      assert.equal(spawnFixturePty(...arguments_, {spawn: (...args) => {
        suppliedCalls++; assert.deepEqual(args, arguments_); return supplied;
      }}), supplied);
      const loadsBeforeHook = globalThis.packageLoads ?? 0;
      const pty = require('node-pty');
      const original = pty.spawn;
      let hooked = 0, started = 0, exited = 0;
      pty.spawn = (...args) => {
        hooked++;
        const terminal = spawnFixturePty(...args, {spawn: original});
        started++;
        terminal.onExit(() => { exited++; });
        return terminal;
      };
      syncBuiltinESMExports(); // Does not repair third-party named exports.
      const production = await import('./production.mjs');
      const terminal = production.spawn(...arguments_);
      terminal.exit();
      const observation = {hooked, underlying: globalThis.nativeCalls.length, started, exited};
      assert.deepEqual(observation, {hooked: 1, underlying: 1, started: 1, exited: 1});
      assert.equal(production.spawn, pty.spawn);
      assert.deepEqual(globalThis.nativeCalls, [arguments_]);
      assert.equal(loadsBeforeHook, 0, 'Supplied spawn must not initialize the default addon');
      assert.equal(suppliedCalls, 1);
      assert.equal(globalThis.packageLoads, 1);
      let fallbackCalls = 0;
      const fallback = {...supplied, pid: 34};
      pty.spawn = (...args) => { fallbackCalls++; assert.deepEqual(args, arguments_); return fallback; };
      assert.equal(spawnFixturePty(...arguments_), fallback);
      assert.equal(require('./adapter.cjs').spawnFixturePty(...arguments_), fallback);
      assert.equal(fallbackCalls, 2);
      assert.equal(globalThis.packageLoads, 1);
      console.log(JSON.stringify({observation, loadsBeforeHook, suppliedCalls, fallbackCalls}));
    `,
    );
    // A finite Node-only subprocess isolates the real loader/cache from Vitest.
    // No shell, actual node-pty, Electron, native addon or process inventory.
    const result = execFileSync(
      process.execPath,
      [path.join(root, "runner.mjs")],
      {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
        timeout: 10_000,
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          NODE_PATH: "",
          OMXTERM_NATIVE_FIXTURE_ROOT: "",
        },
      },
    );
    expect(JSON.parse(result)).toEqual({
      observation: { hooked: 1, underlying: 1, started: 1, exited: 1 },
      loadsBeforeHook: 0,
      suppliedCalls: 1,
      fallbackCalls: 2,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
