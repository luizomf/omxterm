import { describe, expect, it } from "vitest";
import { isInstalledFontFamilyAvailable } from "../../src/main/installed-font-family";

describe("macOS installed font-family availability", () => {
  it("accepts an exact built-in family and rejects a nonexistent family", async () => {
    await expect(isInstalledFontFamilyAvailable("Helvetica")).resolves.toBe(
      true,
    );
    await expect(
      isInstalledFontFamilyAvailable("OMXTerm Definitely Missing Font 37"),
    ).resolves.toBe(false);
  });
});
