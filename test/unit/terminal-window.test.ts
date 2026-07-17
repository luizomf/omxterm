import { describe, expect, it } from "vitest";
import { terminalWindowOptions } from "../../src/main/terminal-window";

describe("Terminal Window startup contract", () => {
  it("uses small native chrome and an isolated renderer preload", () => {
    const options = terminalWindowOptions("/application/preload.cjs");

    expect(options.titleBarStyle).toBe("hiddenInset");
    expect(options.webPreferences).toMatchObject({
      preload: "/application/preload.cjs",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    });
  });
});
