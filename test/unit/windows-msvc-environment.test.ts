import { describe, expect, it } from "vitest";
import { parseEnvironmentDump } from "../../scripts/windows-msvc-environment.mjs";

describe("parseEnvironmentDump", () => {
  it("reads cmd `set` output, including values that contain '=' and CRLF endings", () => {
    expect(
      parseEnvironmentDump(
        "Path=C:\\a;C:\\b\r\nFLAGS=-x=1\r\n=C:=C:\\hidden\r\n\r\n",
      ),
    ).toEqual({ Path: "C:\\a;C:\\b", FLAGS: "-x=1", "=C:": "C:\\hidden" });
  });
});
