import { mountResttyTerminalSurface as mountRealSurface } from "../../src/terminal-surface/restty-terminal-surface";
import {
  cancellationEvidence,
  fontBoundary,
  holdInitialization,
} from "./initialization-cancellation-runtime";
let mounts = 0;
export const mountResttyTerminalSurface: typeof mountRealSurface = async (
  container,
  adapter,
  options = {},
) => {
  const second = ++mounts === 2;
  if (!second) return mountRealSurface(container, adapter, options);
  const acquire = options.acquireFontInputs!;
  try {
    return await mountRealSurface(container, adapter, {
      ...options,
      onFatalError(message) {
        cancellationEvidence.fatals += 1;
        options.onFatalError?.(message);
      },
      async acquireFontInputs(family, signal) {
        const lease = await acquire(family, signal);
        cancellationEvidence.leases += 1;
        if (fontBoundary) await holdInitialization();
        return {
          fonts: lease.fonts,
          release() {
            cancellationEvidence.leases -= 1;
            lease.release();
          },
        };
      },
    });
  } finally {
    cancellationEvidence.settled = true;
  }
};
