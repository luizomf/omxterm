import { expect, it } from "vitest";
import { isExtensionsRequest } from "../../src/shared/extensions";

it("admits only bounded empty-panel preparation and main-issued cancellation tokens", () => {
  const token = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  expect(isExtensionsRequest({ operation: "panel-default" })).toBe(true);
  expect(
    isExtensionsRequest({ operation: "cancel-panel-default", token }),
  ).toBe(true);
  for (const value of [
    { operation: "panel-default", id: "omxterm.snippets" },
    { operation: "panel-default", window: 1 },
    { operation: "panel-default", token },
    { operation: "cancel-panel-default" },
    { operation: "cancel-panel-default", token: "invalid" },
    { operation: "cancel-panel-default", token, extra: true },
  ])
    expect(isExtensionsRequest(value)).toBe(false);
});
