import { expect, it } from "vitest";
import { translatorFor } from "../../src/shared/i18n";
import {
  isSettingsMessage,
  settingsMessageText,
  type SettingsMessage,
} from "../../src/shared/settings-messages";
import {
  isSettingsResult,
  isSettingsSnapshot,
} from "../../src/shared/settings";
import { describeSettingsResult } from "../../src/renderer/settings/settings-results";

const snapshot = {
  configurationPath: "/synthetic/config.json",
  platform: "linux",
  revision: "absent",
  text: null,
  values: {},
};
it("validates bounded Settings-owned identities and relabels them without reverse-matching diagnostics", () => {
  const en = translatorFor("en-US").t;
  const pt = translatorFor("pt-BR").t;
  const messages: SettingsMessage[] = [
    ...(
      [
        "read",
        "utf8",
        "json",
        "object",
        "symlink",
        "conflict",
        "write",
        "application",
      ] as const
    ).map((kind) => ({ kind })),
    { kind: "reload" },
    { kind: "reload", detail: "literal $& <diagnostic>" },
    { kind: "deferred", fields: ["font.family"] },
    { kind: "deferred", fields: ["font.family", "font.lineHeight"] },
  ];
  for (const message of messages) {
    expect(isSettingsMessage(message)).toBe(true);
    expect(settingsMessageText(message, en)).not.toBe(
      settingsMessageText(message, pt),
    );
    expect(isSettingsSnapshot({ ...snapshot, problem: message })).toBe(true);
    expect(isSettingsResult({ status: "failed", snapshot, message })).toBe(
      true,
    );
    const result = {
      status: "saved" as const,
      snapshot,
      lifetimes: [],
      application: { applied: false as const, notice: message },
    };
    expect(isSettingsResult(result)).toBe(true);
    expect(describeSettingsResult(result, pt).text).toContain(
      settingsMessageText(message, pt),
    );
  }
  const literal = en("settings.jsonError");
  expect(settingsMessageText(literal, pt)).toBe(literal);
  expect(
    settingsMessageText(
      { kind: "reload", detail: "literal $& <diagnostic>" },
      pt,
    ),
  ).toContain("literal $& <diagnostic>");
  for (const invalid of [
    null,
    [],
    {},
    { kind: "other" },
    { kind: "read", detail: "extra" },
    { kind: "reload", detail: 7 },
    { kind: "reload", detail: "x".repeat(65_537) },
    { kind: "deferred", fields: [] },
    { kind: "deferred", fields: ["font.size"] },
    { kind: "deferred", fields: ["font.family", "font.family"] },
    "x".repeat(65_537),
  ]) {
    expect(isSettingsMessage(invalid)).toBe(false);
    expect(isSettingsSnapshot({ ...snapshot, problem: invalid })).toBe(false);
    expect(
      isSettingsResult({ status: "failed", snapshot, message: invalid }),
    ).toBe(false);
    expect(
      isSettingsResult({
        status: "saved",
        snapshot,
        lifetimes: [],
        application: { applied: true, notices: [invalid] },
      }),
    ).toBe(false);
  }
});
