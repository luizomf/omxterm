import { describe, expect, it } from "vitest";
import {
  applicationArguments,
  consumeLaunchRequestOnce,
  parseLaunchRequest,
  requestForTerminalWindow,
  withSwitchBeforeLaunchRequest,
} from "../../src/main/launch-request";

describe("startup Launch Request", () => {
  it("isolates user arguments from packaged and development Electron prefixes", () => {
    expect(
      applicationArguments(["/Applications/OMXTerm", "-e", "program"], true),
    ).toEqual(["-e", "program"]);
    expect(
      applicationArguments(
        ["/path/to/electron", "/project", "-e", "program"],
        false,
      ),
    ).toEqual(["-e", "program"]);
  });

  it("keeps a Linux relaunch switch outside literal explicit-command argv", () => {
    expect(
      withSwitchBeforeLaunchRequest(
        ["-e", "program", "--literal"],
        "--ozone-platform=x11",
      ),
    ).toEqual(["--ozone-platform=x11", "-e", "program", "--literal"]);
    expect(
      withSwitchBeforeLaunchRequest(["--existing"], "--ozone-platform=x11"),
    ).toEqual(["--existing", "--ozone-platform=x11"]);
  });

  it("keeps an ordinary launch on the Default Shell", () => {
    expect(parseLaunchRequest(["--user-data-dir=/tmp/example"])).toEqual({
      kind: "default-shell",
    });
  });

  it("preserves every value after the first -e as the executable and literal argv", () => {
    expect(
      parseLaunchRequest([
        "--user-data-dir=/tmp/example",
        "-e",
        "/bin/example",
        "--option-looking",
        "-e",
        "two words",
        "",
      ]),
    ).toEqual({
      kind: "explicit-command",
      executable: "/bin/example",
      arguments: ["--option-looking", "-e", "two words", ""],
    });
  });

  it("accepts another -e as the required executable", () => {
    expect(parseLaunchRequest(["-e", "-e", "literal"])).toEqual({
      kind: "explicit-command",
      executable: "-e",
      arguments: ["literal"],
    });
  });

  it("rejects a terminal -e without falling back to the Default Shell", () => {
    expect(() => parseLaunchRequest(["--switch", "-e"])).toThrow(
      "The -e option requires an executable.",
    );
  });

  it("binds the request to the first Terminal Window even when another window starts a session first", () => {
    const request = {
      kind: "explicit-command" as const,
      executable: "/bin/example",
      arguments: ["literal"],
    };
    const processRequest = consumeLaunchRequestOnce(request);
    const firstWindowRequest = requestForTerminalWindow(1, processRequest);
    const secondWindowRequest = requestForTerminalWindow(2, processRequest);

    expect(secondWindowRequest()).toEqual({ kind: "default-shell" });
    expect(firstWindowRequest()).toBe(request);
    expect(firstWindowRequest()).toEqual({ kind: "default-shell" });
  });

  it("consumes an explicit command for only the first Live Terminal Session", () => {
    const request = {
      kind: "explicit-command" as const,
      executable: "/bin/example",
      arguments: ["literal"],
    };
    const consume = consumeLaunchRequestOnce(request);

    expect(consume()).toBe(request);
    expect(consume()).toEqual({ kind: "default-shell" });
    expect(consume()).toEqual({ kind: "default-shell" });
  });
});
