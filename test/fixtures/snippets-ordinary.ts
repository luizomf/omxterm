import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { userInfo } from "node:os";
import path from "node:path";

export const packageSource = "575407cc61648b8dbf598dd7e1c4d46345c31ff2";
export const snippetsSha256 =
  "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7";
export const hash = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export function ordinaryInputs(env = process.env, home = userInfo().homedir) {
  const prefix = "OMXTERM_SNIPPETS_ORDINARY_";
  if (
    !Object.keys(env).some(
      (key) => key.startsWith(prefix) && env[key] !== undefined,
    )
  )
    return;
  assert.equal(process.platform, "linux");
  assert.equal(process.arch, "arm64");
  assert.notEqual(process.getuid?.(), 0);
  assert.equal(
    env.HOME,
    home,
    "temporary HOME is not ordinary account identity",
  );
  assert.ok(!env.NODE_OPTIONS && !env.ELECTRON_RUN_AS_NODE);
  const appImage = env[prefix + "APPIMAGE"];
  const digest = env[prefix + "SHA256"];
  const evidence = env[prefix + "EVIDENCE"];
  assert.ok(appImage && path.isAbsolute(appImage));
  assert.ok(evidence && path.isAbsolute(evidence));
  assert.match(digest ?? "", /^[a-f0-9]{64}$/);
  const config = path.join(
    env.XDG_CONFIG_HOME || path.join(home, ".config"),
    "omxterm",
  );
  const state = path.join(
    env.XDG_STATE_HOME || path.join(home, ".local/state"),
    "omxterm",
  );
  for (const root of [config, state]) {
    assert.ok(path.isAbsolute(root));
    assert.ok(evidence !== root && !evidence.startsWith(root + path.sep));
  }
  return {
    appImage,
    digest: digest!,
    evidence,
    profile: config,
    config,
    state,
    home,
  };
}

export function assertAbsentRoots(roots: string[]) {
  for (const root of roots) {
    let current = root;
    let missing = false;
    for (;;) {
      try {
        const stat = lstatSync(current);
        assert.ok(
          current !== root && stat.isDirectory() && !stat.isSymbolicLink(),
          "existing/linked/non-directory ordinary root",
        );
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ))
          throw error;
        missing = true;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    assert.ok(missing);
  }
}

type Location = { scriptId: string; lineNumber: number; columnNumber: number };
export type ColdPause = {
  reason: string;
  hitBreakpoints: unknown[];
  callFrames: Array<{
    callFrameId: string;
    functionName: string;
    location: Location;
    functionLocation: Location;
    scopeChain: Array<{ type: string }>;
  }>;
};
export function assertColdPause(
  pause: ColdPause,
  url: (id: string) => string | undefined,
  entry: string,
  loaderSha256: string,
) {
  const frame = pause.callFrames[0]!;
  assert.equal(pause.reason, "Break on start");
  assert.deepEqual(pause.hitBreakpoints, []);
  assert.equal(url(frame.location.scriptId), entry);
  assert.equal(frame.location.lineNumber, 0);
  assert.equal(frame.location.columnNumber, 0);
  assert.deepEqual(frame.functionLocation, frame.location);
  assert.ok(frame.scopeChain.some((s) => s.type === "module"));
  const loader = pause.callFrames.find(
    (f) => url(f.location.scriptId) === "node:internal/modules/esm/module_job",
  );
  assert.ok(loader);
  assert.equal(loader.functionName, "#asyncInstantiate");
  assert.equal(loader.location.lineNumber, 452);
  assert.equal(loader.location.columnNumber, 8);
  // The pinned Electron43.8.1 runtime's instantiation pause precedes evaluation.
  // Unknown runtimes/loader locations fail, never downgrade to a late observer.
  assert.equal(
    loaderSha256,
    "1a8f350a32ce47b4e45b2251fc15f4438d322b5b9d227dc74d5f9846fb0ccacf",
  );
}

type DormantObservations = {
  forks: unknown[];
  views: string[];
  urls: string[];
  yamlWrites: unknown[];
  nodeNetwork: unknown[];
};
export function assertDormant(snapshot: DormantObservations) {
  assert.deepEqual(snapshot.forks, [], "no cold-start backend process");
  assert.deepEqual(
    snapshot.nodeNetwork,
    [],
    "no Node HTTP(S)/fetch acquisition",
  );
  assert.ok(
    [...snapshot.views, ...snapshot.urls].every(
      (u) => typeof u === "string" && !u.startsWith("omx-extension:"),
    ),
    "no hosted extension view, including transient navigation",
  );
  assert.deepEqual(snapshot.yamlWrites, [], "no Node filesystem YAML mutation");
}
export function assertOrdinaryQuit(
  quit: DormantObservations & {
    joined: boolean;
    natural: boolean;
    quitApprovals: number;
  },
) {
  assertDormant(quit);
  assert.equal(quit.joined, true);
  assert.equal(quit.natural, true);
  assert.equal(quit.quitApprovals, 1, "one controlled normal-Quit consent");
}

type SettledFiles = {
  registry: Buffer;
  witness: Buffer | undefined;
  yaml: Buffer | undefined;
};
export function assertSettledFiles(
  actual: SettledFiles,
  expected: SettledFiles,
) {
  assert.deepEqual(
    actual,
    expected,
    "postsettlement registry/witness/YAML bytes and absence",
  );
}

// Electron43.8.1's actual Chromium NetLog vocabulary, not arbitrary caller IDs.
export const mandatoryNetLogTypes = {
  TCP_CONNECT: 50,
  UDP_CONNECT: 94,
  HOST_RESOLVER_MANAGER_REQUEST: 5,
} as const;
export function assertNoNetwork(input: unknown) {
  const log = input as {
    constants?: { logEventTypes?: Record<string, unknown> };
    events?: unknown[];
  } | null;
  const types = log?.constants?.logEventTypes;
  assert.ok(types && typeof types === "object", "missing NetLog vocabulary");
  for (const [name, id] of Object.entries(mandatoryNetLogTypes))
    assert.equal(
      types[name],
      id,
      `unknown mandatory NetLog identifier: ${name}`,
    );
  const known = Object.values(types);
  assert.ok(
    known.every((id) => Number.isSafeInteger(id) && (id as number) >= 0),
    "invalid NetLog vocabulary",
  );
  assert.ok(Array.isArray(log.events), "missing NetLog events");
  const forbidden: number[] = Object.values(mandatoryNetLogTypes);
  for (const value of log.events) {
    const event = value as {
      type?: unknown;
      params?: { url?: unknown };
    } | null;
    assert.ok(
      event && Number.isSafeInteger(event.type) && known.includes(event.type),
      "unknown NetLog event type",
    );
    assert.ok(
      !forbidden.includes(event.type as number),
      "unexpected packaged network activity",
    );
    const url = event.params?.url;
    assert.ok(
      url === undefined || (typeof url === "string" && !/^https?:/i.test(url)),
      "unexpected packaged network URL",
    );
  }
}

// Local owner aggregation: keep original error objects and attempt every selected
// recording/finalization stage. No retries and no framework-wide reporting policy.
export function ordinaryOutcome() {
  const failures: { stage: string; error: unknown }[] = [];
  return {
    failures,
    async attempt(stage: string, operation: () => unknown | Promise<unknown>) {
      try {
        await operation();
      } catch (error) {
        failures.push({ stage, error });
      }
    },
    records() {
      return failures.map(({ stage, error }) => ({
        stage,
        error: String(error),
      }));
    },
    throwIfFailed(message: string) {
      if (failures.length)
        throw new AggregateError(
          failures.map((f) => f.error),
          `${message}: ${failures.map((f) => f.stage).join(", ")}`,
        );
    },
  };
}
