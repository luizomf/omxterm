import assert from "node:assert/strict";
import type { NativeFixtureResult } from "./run-native-fixture";

export const NATIVE_WINDOW_PREFIX = "__OMXTERM_NATIVE_WINDOW__";
export const NATIVE_RESPONSE_MS = 25_000;
export const NATIVE_SETUP_MS = 5_000;
export type NativeWindowKind = "cursor" | "chrome";
export type ChromeNativeExpectation =
  | "native-maximize-observed"
  | "native-maximize-not-observed"
  | "not-exercised-macos";
export interface NativeWindowRequest {
  readonly id: string;
  readonly kind: NativeWindowKind;
  readonly platform: string;
  readonly dpr: number;
}
export interface NativeWindowAction {
  readonly recipe: "framed" | "app";
  readonly action: "minimize" | "hide" | "maximize" | "restore";
  readonly outcome: "observed" | "not-observed-within-budget";
  readonly elapsedMs: number;
}

export function rejectLegacyNativeWindowDeclarations(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  for (const key of [
    "OMXTERM_TEST_CURSOR_PRESENTATION_CONTROL",
    "OMXTERM_TEST_WINDOW_POLICY",
  ])
    if (Object.hasOwn(environment, key))
      throw new Error(
        `${key} is retired; unset it. Native fixtures now observe independent native windows for this run.`,
      );
}

// Sequential native actions each retain the full response allowance, plus a
// bounded renderer health check. Each recipe has load/show/initial-health work.
export function nativeWindowDiscoveryTimeout(kind: NativeWindowKind): number {
  return (
    NATIVE_SETUP_MS +
    (kind === "cursor" ? 2 : 4) * (NATIVE_RESPONSE_MS + NATIVE_SETUP_MS) +
    (kind === "cursor" ? 1 : 2) * 3 * NATIVE_SETUP_MS +
    10_000
  );
}

function keys(
  value: unknown,
  expected: string[],
): asserts value is Record<string, unknown> {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    "Invalid native window observation object",
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    "Invalid native window observation fields",
  );
}

/** A report alone never proves success. Bind complete unique output to this
 * invocation and the supervisor's actual exit/cleanup before selecting a path. */
export function readNativeWindowObservation(
  result: NativeFixtureResult,
  request: NativeWindowRequest,
): "early-minimize" | "early-hide" | ChromeNativeExpectation {
  assert.equal(result.exitCode, 0, "Independent native observation failed");
  assert.equal(result.signal, null, "Independent native observation signalled");
  assert.equal(
    result.reason,
    "exit",
    "Independent native observation did not complete",
  );
  assert.deepEqual(
    result.cleanupErrors,
    [],
    "Independent native observation cleanup uncertain",
  );
  const lines = result.stdout
    .split("\n")
    .filter((line) => line.startsWith(NATIVE_WINDOW_PREFIX));
  assert.equal(
    lines.length,
    1,
    "Expected one complete independent native window observation",
  );
  const report: unknown = JSON.parse(
    lines[0]!.slice(NATIVE_WINDOW_PREFIX.length),
  );
  keys(report, [
    "version",
    "id",
    "kind",
    "platform",
    "dpr",
    "budgetMs",
    "observations",
  ]);
  assert.equal(report.version, 1);
  for (const key of ["id", "kind", "platform", "dpr"] as const)
    assert.equal(
      report[key],
      request[key],
      "Native observation invocation mismatch",
    );
  assert.equal(report.budgetMs, NATIVE_RESPONSE_MS);
  assert.ok(Array.isArray(report.observations));
  const actions: NativeWindowAction[] = report.observations.map(
    (value: unknown) => {
      keys(value, ["recipe", "action", "outcome", "elapsedMs"]);
      assert.ok(["framed", "app"].includes(String(value.recipe)));
      assert.ok(
        ["minimize", "hide", "maximize", "restore"].includes(
          String(value.action),
        ),
      );
      assert.ok(
        ["observed", "not-observed-within-budget"].includes(
          String(value.outcome),
        ),
      );
      assert.ok(
        typeof value.elapsedMs === "number" &&
          Number.isSafeInteger(value.elapsedMs) &&
          value.elapsedMs >= 0,
      );
      if (value.outcome === "not-observed-within-budget")
        assert.ok(
          value.elapsedMs >= NATIVE_RESPONSE_MS,
          "Incomplete native response observation",
        );
      return value as unknown as NativeWindowAction;
    },
  );
  const signature = actions.map(
    ({ recipe, action, outcome }) => `${recipe}/${action}/${outcome}`,
  );
  if (request.kind === "cursor") {
    if (signature[0] === "framed/minimize/observed") {
      assert.deepEqual(
        signature,
        ["framed/minimize/observed", "framed/restore/observed"],
        "Native minimize restoration not observed",
      );
      return "early-minimize";
    }
    assert.deepEqual(
      signature,
      ["framed/minimize/not-observed-within-budget", "framed/hide/observed"],
      "No observed unavailable-presentation control",
    );
    return "early-hide";
  }
  assert.equal(request.kind, "chrome");
  if (signature[0] === "framed/maximize/observed") {
    assert.deepEqual(
      signature,
      [
        "framed/maximize/observed",
        "framed/restore/observed",
        "app/maximize/observed",
        "app/restore/observed",
      ],
      "Native maximize references disagree or restoration failed",
    );
    return "native-maximize-observed";
  }
  assert.deepEqual(
    signature,
    [
      "framed/maximize/not-observed-within-budget",
      "app/maximize/not-observed-within-budget",
    ],
    "Native maximize references disagree",
  );
  return "native-maximize-not-observed";
}

export function chromeNativeExpectation(
  argv: readonly string[],
  platform: string = process.platform,
): ChromeNativeExpectation {
  const values = argv.filter((value) =>
    value.startsWith("--fixture-native-maximize="),
  );
  assert.equal(
    values.length,
    1,
    "Missing or duplicate run-local native maximize expectation",
  );
  const value = values[0]!.slice("--fixture-native-maximize=".length);
  assert.ok(
    value === "native-maximize-observed" ||
      value === "native-maximize-not-observed" ||
      (value === "not-exercised-macos" && platform === "darwin"),
    "Invalid run-local native maximize expectation",
  );
  return value;
}
