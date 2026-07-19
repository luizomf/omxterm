// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderUserFileErrorBanner } from "../../src/renderer/user-file-error-banner";

function createBanner(): HTMLElement {
  const banner = document.createElement("aside");
  banner.hidden = true;
  document.body.appendChild(banner);
  return banner;
}

describe("User File Error banner", () => {
  it("stays hidden and empty when there is nothing to report", () => {
    const banner = createBanner();
    renderUserFileErrorBanner(banner, []);
    expect(banner.hidden).toBe(true);
    expect(banner.childElementCount).toBe(0);
  });

  it("shows every message as text without interpreting markup", () => {
    const banner = createBanner();
    renderUserFileErrorBanner(banner, [
      'User Configuration "/home/tester/.config/omxterm/config.json" is not valid JSON.',
      "<img src=x onerror=alert(1)>",
    ]);
    expect(banner.hidden).toBe(false);
    expect(banner.childElementCount).toBe(2);
    expect(banner.textContent).toContain("config.json");
    expect(banner.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(banner.querySelector("img")).toBeNull();
  });

  it("replaces earlier content on re-render and hides again when clear", () => {
    const banner = createBanner();
    renderUserFileErrorBanner(banner, ["first"]);
    renderUserFileErrorBanner(banner, ["second"]);
    expect(banner.textContent).toBe("second");
    renderUserFileErrorBanner(banner, []);
    expect(banner.hidden).toBe(true);
    expect(banner.childElementCount).toBe(0);
  });
});
