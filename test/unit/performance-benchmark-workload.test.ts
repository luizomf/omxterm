import { describe, expect, it } from "vitest";
import {
  windowsWorkloadProgram,
  workloadEntryCommand,
} from "../fixtures/performance-benchmark-workload";

describe("native benchmark workloads", () => {
  it("uses a Windows PowerShell 5.1 escape and UTF-8 output", () => {
    const program = windowsWorkloadProgram();
    expect(Buffer.from(program, "utf8").subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    );
    expect(program).not.toContain("`e");
    expect(program).toContain("[char]27");
    expect(program).toContain("[Console]::OutputEncoding");
  });
  it("quotes Windows fixture paths as literal PowerShell strings", () => {
    expect(workloadEntryCommand("C:/my dir/it's; $bad", "windows")).toBe(
      "& 'C:/my dir/it''s; $bad/workload.ps1'",
    );
  });
});
