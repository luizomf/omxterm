import { describe, expect, it } from "vitest";
import { parseInstalledFontFamilies } from "../../src/main/installed-font-families";

describe("macOS installed font-family discovery", () => {
  it("returns only exact enabled and valid family fields, not face or PostScript names", () => {
    const profile = JSON.stringify({
      SPFontsDataType: [
        {
          enabled: "yes",
          valid: "yes",
          typefaces: [
            {
              _name: "ExactFamily-Regular",
              fullname: "Exact Family Regular",
              family: "Exact Family",
              enabled: "yes",
              valid: "yes",
            },
            {
              family: "Disabled Family",
              enabled: "no",
              valid: "yes",
            },
          ],
        },
      ],
    });

    expect([...parseInstalledFontFamilies(profile)]).toEqual(["Exact Family"]);
  });

  it("rejects malformed discovery JSON", () => {
    expect(() => parseInstalledFontFamilies("not JSON")).toThrow(TypeError);
  });
});
