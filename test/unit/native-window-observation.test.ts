import { expect, it } from "vitest";
import {
  readNativeWindowObservation,
  rejectLegacyNativeWindowDeclarations,
  chromeNativeExpectation,
  nativeWindowDiscoveryTimeout,
} from "../fixtures/window-policy";

const request = {
  id: "owned-invocation",
  kind: "cursor" as const,
  platform: "linux",
  dpr: 1,
};
const action = (
  name: string,
  outcome = "observed",
  recipe = "framed",
  elapsedMs = outcome === "observed" ? 10 : 25000,
) => ({ recipe, action: name, outcome, elapsedMs });
const execution = (observations: unknown[], kind = "cursor") => ({
  exitCode: 0,
  signal: null,
  reason: "exit",
  cleanupErrors: [] as string[],
  stderr: "",
  stdout: `__OMXTERM_NATIVE_WINDOW__${JSON.stringify({ version: 1, ...request, kind, budgetMs: 25000, observations })}\n`,
});
const minimized = () => execution([action("minimize"), action("restore")]);
it("retains actual minimization when the independent reference minimizes and restores", () => {
  expect(readNativeWindowObservation(minimized(), request)).toBe(
    "early-minimize",
  );
});
it("selects separately named real hide only after complete independent minimize absence and observed hide", () => {
  expect(
    readNativeWindowObservation(
      execution([
        action("minimize", "not-observed-within-budget"),
        action("hide"),
      ]),
      request,
    ),
  ).toBe("early-hide");
});
it.each(
  [
    [],
    [action("maximize", "not-observed-within-budget"), action("hide")],
    [action("minimize")],
    [action("minimize"), action("restore", "not-observed-within-budget")],
    [
      action("minimize", "not-observed-within-budget", "framed", 24999),
      action("hide"),
    ],
    [
      action("minimize", "not-observed-within-budget"),
      action("hide", "not-observed-within-budget"),
    ],
    [action("minimize", "invalid"), action("hide")],
    [{ ...action("minimize"), extra: true }, action("restore")],
  ].map((observations) => ({ observations })),
)(
  "rejects unusable or malformed cursor observations %j",
  ({ observations }) => {
    expect(() =>
      readNativeWindowObservation(execution(observations), request),
    ).toThrow();
  },
);
it.each([
  { exitCode: 1 },
  { signal: "SIGTERM" as const },
  { reason: "timeout" },
  { cleanupErrors: ["uncertain"] },
  { stdout: "" },
  { stdout: "__OMXTERM_NATIVE_WINDOW__{}\n" },
  { stdout: "__OMXTERM_NATIVE_WINDOW__invalid\n" },
])(
  "never converts supervision/report failure into unavailable behavior %j",
  (change) => {
    expect(() =>
      readNativeWindowObservation({ ...minimized(), ...change }, request),
    ).toThrow();
  },
);
it("rejects duplicate output and a complete result from another invocation/DPR/platform", () => {
  const result = minimized();
  expect(() =>
    readNativeWindowObservation(
      { ...result, stdout: result.stdout.repeat(2) },
      request,
    ),
  ).toThrow();
  for (const change of [{ id: "other" }, { dpr: 2 }, { platform: "win32" }])
    expect(() =>
      readNativeWindowObservation(result, { ...request, ...change }),
    ).toThrow();
});
it("requires agreement and real restoration for both independent maximize recipes", () => {
  const chrome = { ...request, kind: "chrome" as const };
  expect(
    readNativeWindowObservation(
      execution(
        [
          action("maximize"),
          action("restore"),
          action("maximize", "observed", "app"),
          action("restore", "observed", "app"),
        ],
        "chrome",
      ),
      chrome,
    ),
  ).toBe("native-maximize-observed");
  expect(
    readNativeWindowObservation(
      execution(
        [
          action("maximize", "not-observed-within-budget"),
          action("maximize", "not-observed-within-budget", "app"),
        ],
        "chrome",
      ),
      chrome,
    ),
  ).toBe("native-maximize-not-observed");
  for (const observations of [
    [
      action("maximize"),
      action("restore"),
      action("maximize", "not-observed-within-budget", "app"),
    ],
    [
      action("maximize", "not-observed-within-budget"),
      action("maximize", "observed", "app"),
      action("restore", "observed", "app"),
    ],
    [
      action("maximize"),
      action("restore", "not-observed-within-budget"),
      action("maximize", "observed", "app"),
      action("restore", "observed", "app"),
    ],
  ])
    expect(() =>
      readNativeWindowObservation(execution(observations, "chrome"), chrome),
    ).toThrow();
});
it("gives sequential discovery its own budget without shortening the 25-second native response", () => {
  expect(nativeWindowDiscoveryTimeout("cursor")).toBe(90000);
  expect(nativeWindowDiscoveryTimeout("chrome")).toBe(165000);
});
it.each([
  "OMXTERM_TEST_CURSOR_PRESENTATION_CONTROL",
  "OMXTERM_TEST_WINDOW_POLICY",
])("rejects any stale presence of %s with actionable migration", (key) => {
  for (const value of [
    "",
    "hide",
    "standard",
    "hyprland-suppress-maximize",
    "typo",
  ])
    expect(() =>
      rejectLegacyNativeWindowDeclarations({ [key]: value }),
    ).toThrow(`${key} is retired; unset it.`);
  expect(() => rejectLegacyNativeWindowDeclarations({})).not.toThrow();
});
it("does not claim native custom-control coverage on macOS", () => {
  expect(
    chromeNativeExpectation(
      ["--fixture-native-maximize=not-exercised-macos"],
      "darwin",
    ),
  ).toBe("not-exercised-macos");
  expect(() =>
    chromeNativeExpectation(
      ["--fixture-native-maximize=not-exercised-macos"],
      "linux",
    ),
  ).toThrow();
});
it("passes one strict run-local choice, never environment/policy provenance", () => {
  expect(
    chromeNativeExpectation([
      "--fixture-native-maximize=native-maximize-not-observed",
    ]),
  ).toBe("native-maximize-not-observed");
  for (const argv of [
    [],
    ["--fixture-native-maximize=standard"],
    ["--fixture-native-maximize="],
    [
      "--fixture-native-maximize=native-maximize-observed",
      "--fixture-native-maximize=native-maximize-not-observed",
    ],
  ])
    expect(() => chromeNativeExpectation(argv)).toThrow();
});
