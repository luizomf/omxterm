import { expect, it } from "vitest";
import { trustedEndpoint } from "../../src/agent-ctl/commands";
import { agentEndpointPath } from "../../src/main/agent-access";

// On Windows a grant file may only send the client to OMXTerm's local pipe.
it("accepts the pipe main names for any profile", () => {
  for (const profile of ["C:\\Users\\me\\AppData\\Roaming\\omxterm", "D:\\p"])
    expect(trustedEndpoint(agentEndpointPath(profile, "win32"), "win32")).toBe(
      true,
    );
});

it.each([
  "\\\\host\\pipe\\omxterm-agent-0123456789abcdef",
  "\\\\.\\pipe\\other",
  "\\\\.\\pipe\\omxterm-agent-0123456789ABCDEF",
  "\\\\.\\pipe\\omxterm-agent-0123456789abcdef0",
  "\\\\.\\pipe\\omxterm-agent-0123456789abcdef\\x",
  "C:\\Users\\me\\ctl.sock",
  "",
  3,
])("refuses %j on Windows", (endpoint) => {
  expect(trustedEndpoint(endpoint, "win32")).toBe(false);
});

it("leaves Unix sockets to the grant file's owner and mode checks", () => {
  expect(trustedEndpoint("/tmp/p/agent-api/ctl.sock", "linux")).toBe(true);
  expect(trustedEndpoint(undefined, "darwin")).toBe(false);
});
