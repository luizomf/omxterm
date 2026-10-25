import { describe, expect, it, vi } from "vitest";
import { applyChromiumGpuPolicy } from "../../src/main/chromium-gpu-policy";

describe("Chromium GPU launch policy", () => {
  it("allows the Linux software WebGL fallback without overriding the blocklist", () => {
    const commandLine = { appendSwitch: vi.fn() };
    applyChromiumGpuPolicy(commandLine, "linux");
    expect(commandLine.appendSwitch).toHaveBeenCalledExactlyOnceWith(
      "enable-unsafe-swiftshader",
    );
  });
  it.each(["darwin", "win32"] as const)("keeps %s unchanged", (platform) => {
    const commandLine = { appendSwitch: vi.fn() };
    applyChromiumGpuPolicy(commandLine, platform);
    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
  });
});
