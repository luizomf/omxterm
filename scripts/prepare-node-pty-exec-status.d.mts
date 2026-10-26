import type { execFileSync } from "node:child_process";

export function prepareNodePtyExecStatus(options?: {
  readonly platform?: NodeJS.Platform | string;
  readonly arch?: string;
  readonly nodePtyRoot?: string;
  readonly execute?: typeof execFileSync;
}): Promise<void>;
