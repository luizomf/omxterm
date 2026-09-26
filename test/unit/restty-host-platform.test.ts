import { expect, it } from "vitest";
import { defaultInputCommand } from "../fixtures/restty-host-platform";

it.each(["win32", "darwin", "linux"] as const)(
  "%s Unicode execution acknowledgement cannot be satisfied by command echo",
  (platform) => {
    const typed = defaultInputCommand(platform);
    expect(typed).toContain("Olá🙂");
    expect(typed).not.toContain("__DEFAULT_INPUT__Olá🙂");
  },
);
