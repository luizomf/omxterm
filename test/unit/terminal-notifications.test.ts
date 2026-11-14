import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createTerminalNotifications,
  NOTIFICATION_INTERVAL_MS,
} from "../../src/main/terminal-notifications";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import { MAX_ATTENTION_SOUND_BYTES } from "../../src/shared/terminal-attention";
import type { NotificationPreferences } from "../../src/shared/user-configuration";

vi.mock("electron", () => ({
  app: {},
  Notification: {},
  shell: {},
}));
const { readSoundFile } =
  await import("../../src/main/terminal-window-notifications");

function harness(
  preferences: NotificationPreferences = { enabled: true, sound: false },
  platform = "darwin",
) {
  let now = 10_000;
  const created: {
    options: { title: string; body: string; silent: boolean };
    show: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    click(): void;
  }[] = [];
  const reveal = vi.fn();
  const beep = vi.fn();
  const playSoundFile = vi.fn();
  const notifications = createTerminalNotifications({
    platform,
    preferences: () => preferences,
    isSupported: () => true,
    create(options) {
      const listeners: (() => void)[] = [];
      const native = {
        options,
        show: vi.fn(),
        close: vi.fn(),
        click: () => listeners.forEach((listener) => listener()),
      };
      created.push(native);
      return {
        on: (_event: "click", listener: () => void) => listeners.push(listener),
        show: native.show,
        close: native.close,
      };
    },
    reveal,
    beep,
    playSoundFile,
    now: () => now,
  });
  return {
    notifications,
    created,
    reveal,
    beep,
    playSoundFile,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("native terminal notifications", () => {
  it("shows the program's text silently by default and reveals its session on click", () => {
    const h = harness();
    h.notifications.show("s1", { title: "agent", body: "Done" });
    expect(h.created.map(({ options }) => options)).toEqual([
      { title: "agent", body: "Done", silent: true },
    ]);
    expect(h.created[0]!.show).toHaveBeenCalledOnce();
    h.created[0]!.click();
    expect(h.reveal).toHaveBeenCalledExactlyOnceWith("s1");
    expect(h.beep).not.toHaveBeenCalled();
    expect(h.playSoundFile).not.toHaveBeenCalled();
  });

  it("keeps one notification per session and ignores repeats inside the interval", () => {
    const h = harness();
    h.notifications.show("s1", { title: "agent", body: "one" });
    h.notifications.show("s1", { title: "agent", body: "flood" });
    h.notifications.show("s2", { title: "other", body: "two" });
    expect(h.created.map(({ options }) => options.body)).toEqual([
      "one",
      "two",
    ]);
    h.advance(NOTIFICATION_INTERVAL_MS);
    h.notifications.show("s1", { title: "agent", body: "three" });
    expect(h.created[0]!.close).toHaveBeenCalledOnce();
    expect(h.created.map(({ options }) => options.body)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(h.created[1]!.close).not.toHaveBeenCalled();
    expect(h.created[2]!.close).not.toHaveBeenCalled();
  });

  it("leaves delivered notifications for the user when the session ends or the window goes", () => {
    const h = harness();
    h.notifications.show("s1", { title: "agent", body: "one" });
    h.notifications.show("s2", { title: "other", body: "two" });
    h.notifications.show("s3", { title: "third", body: "three" });
    h.notifications.ended("s1");
    h.notifications.dispose();
    for (const native of h.created) expect(native.close).not.toHaveBeenCalled();

    // Clicks that outlive the session or window do nothing.
    h.created[0]!.click();
    h.created[1]!.click();
    expect(h.reveal).not.toHaveBeenCalled();
    h.notifications.show("s4", { title: "late", body: "late" });
    expect(h.created).toHaveLength(3);
  });

  it("still reveals a notification that outlived the attention mark", () => {
    const h = harness();
    h.notifications.show("s1", { title: "agent", body: "Done" });
    h.created[0]!.click();
    expect(h.reveal).toHaveBeenCalledExactlyOnceWith("s1");
  });

  it("ignores a click on a notification a newer one replaced", () => {
    const h = harness();
    h.notifications.show("s1", { title: "agent", body: "old" });
    h.advance(NOTIFICATION_INTERVAL_MS);
    h.notifications.show("s1", { title: "agent", body: "new" });
    h.created[0]!.click();
    expect(h.reveal).not.toHaveBeenCalled();
    h.created[1]!.click();
    expect(h.reveal).toHaveBeenCalledExactlyOnceWith("s1");
  });

  it("plays the system sound with the notification, or alone when notifications are off", () => {
    const on = harness({ enabled: true, sound: true });
    on.notifications.show("s1", { title: "agent", body: "Done" });
    expect(on.created[0]!.options.silent).toBe(false);
    expect(on.beep).not.toHaveBeenCalled();

    const off = harness({ enabled: false, sound: true });
    off.notifications.show("s1", { title: "agent", body: "Done" });
    expect(off.created).toEqual([]);
    expect(off.beep).toHaveBeenCalledOnce();

    const quiet = harness({ enabled: false, sound: false });
    quiet.notifications.show("s1", { title: "agent", body: "Done" });
    expect(quiet.created).toEqual([]);
    expect(quiet.beep).not.toHaveBeenCalled();
  });

  it("plays the user's sound file instead of the system sound", () => {
    const h = harness({
      enabled: true,
      sound: true,
      soundFile: "/sounds/done.wav",
    });
    h.notifications.show("s1", { title: "agent", body: "Done" });
    expect(h.playSoundFile).toHaveBeenCalledExactlyOnceWith("/sounds/done.wav");
    expect(h.created[0]!.options.silent).toBe(true);
    expect(h.beep).not.toHaveBeenCalled();
  });

  it("bounds the text again and keeps Linux bodies out of markup", () => {
    const linux = harness(undefined, "linux");
    linux.notifications.show("s1", {
      title: "a\nb",
      body: `<b>bold</b> & ${"x".repeat(600)}`,
    });
    const { title, body } = linux.created[0]!.options;
    expect(title).toBe("a b");
    expect(body.startsWith("&lt;b&gt;bold&lt;/b&gt; &amp; x")).toBe(true);
    expect(body.endsWith("…")).toBe(true);
  });
});

describe("notification preferences", () => {
  const validate = (notifications: unknown, platform = "darwin") =>
    validateUserConfiguration(
      { version: 1, notifications },
      "/config/omxterm/config.json",
      new Set(),
      undefined,
      platform,
    ).notifications;

  it("turns notifications on and sound off by default", () => {
    expect(validate(undefined)).toEqual({ enabled: true, sound: false });
    expect(validate({ enabled: false, sound: true })).toEqual({
      enabled: false,
      sound: true,
    });
    expect(validate({ sound: true, soundFile: "/sounds/done.wav" })).toEqual({
      enabled: true,
      sound: true,
      soundFile: "/sounds/done.wav",
    });
    expect(validate({ soundFile: "C:\\Sounds\\done.wav" }, "win32")).toEqual({
      enabled: true,
      sound: false,
      soundFile: "C:\\Sounds\\done.wav",
    });
  });

  it.each([
    [{ enabled: "yes" }, "notifications.enabled"],
    [{ sound: 1 }, "notifications.sound"],
    [{ soundFile: "done.wav" }, "notifications.soundFile"],
    [{ soundFile: "" }, "notifications.soundFile"],
    [{ volume: 1 }, "notifications.volume"],
    [[], "notifications"],
  ])("rejects %j at %s", (notifications, location) => {
    expect(() => validate(notifications)).toThrow(
      expect.objectContaining({ location }),
    );
  });
});

describe("notification sound file", () => {
  it("reads a bounded regular file and refuses anything else", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "omxterm-sound-"));
    const sound = path.join(directory, "done.wav");
    await writeFile(sound, Buffer.from([1, 2, 3]));
    const empty = path.join(directory, "empty.wav");
    await writeFile(empty, "");
    const large = path.join(directory, "large.wav");
    await writeFile(large, Buffer.alloc(MAX_ATTENTION_SOUND_BYTES + 1));

    expect(await readSoundFile(sound)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await readSoundFile(empty)).toBeUndefined();
    expect(await readSoundFile(large)).toBeUndefined();
    expect(await readSoundFile(directory)).toBeUndefined();
    expect(
      await readSoundFile(path.join(directory, "missing")),
    ).toBeUndefined();
  });
});
