import { spawn } from "node-pty";
import { spawnFixtureProcess } from "./native-fixture-ownership";

// Keep every PTY used by the supervised host fixture on the same ownership path.
export const spawnFixturePty: typeof spawn = (...args) =>
  spawnFixtureProcess(() => spawn(...args));
