import type { CommandDefinition } from "../commands";
import { FILES_COMMANDS } from "./files";
import { ARCHIVES_COMMANDS } from "./archives";
import { SYSTEM_COMMANDS } from "./system";
import { SERVICES_COMMANDS } from "./services";
import { PACKAGES_COMMANDS } from "./packages";
import { NETWORK_COMMANDS } from "./network";
import { DEVELOPER_COMMANDS } from "./developer";

// Built-in Command Manager templates. See ./helpers for how each command
// declares its platforms and required programs.
export const BUILTIN_COMMANDS: readonly CommandDefinition[] = [
  ...FILES_COMMANDS,
  ...ARCHIVES_COMMANDS,
  ...SYSTEM_COMMANDS,
  ...SERVICES_COMMANDS,
  ...PACKAGES_COMMANDS,
  ...NETWORK_COMMANDS,
  ...DEVELOPER_COMMANDS,
];
