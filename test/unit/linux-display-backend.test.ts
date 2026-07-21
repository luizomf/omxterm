import { describe, expect, it, vi } from "vitest";
import { applyLinuxDisplayBackendDefault } from "../../src/main/linux-display-backend";

describe("Linux display backend", () => {
  it("defaults Linux to X11 when the user did not choose an Ozone backend", () => {
    const commandLine = {
      hasSwitch: vi.fn(() => false),
      appendSwitch: vi.fn(),
    };

    expect(applyLinuxDisplayBackendDefault(commandLine, "linux")).toBe(true);
    expect(commandLine.hasSwitch).toHaveBeenCalledWith("ozone-platform");
    expect(commandLine.appendSwitch).toHaveBeenCalledExactlyOnceWith(
      "ozone-platform",
      "x11",
    );
  });

  it("preserves an explicit Linux backend override", () => {
    const commandLine = {
      hasSwitch: vi.fn(() => true),
      appendSwitch: vi.fn(),
    };

    expect(applyLinuxDisplayBackendDefault(commandLine, "linux")).toBe(false);
    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
  });

  it("does not add Linux switches on another platform", () => {
    const commandLine = {
      hasSwitch: vi.fn(),
      appendSwitch: vi.fn(),
    };

    expect(applyLinuxDisplayBackendDefault(commandLine, "darwin")).toBe(false);
    expect(commandLine.hasSwitch).not.toHaveBeenCalled();
    expect(commandLine.appendSwitch).not.toHaveBeenCalled();
  });
});
