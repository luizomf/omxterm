import type { PreparedLayout } from "./terminal-layout-transfer";

export interface RestorationWindowOptions {
  plan: PreparedLayout;
  focus(): boolean;
  accepted(): void;
}
