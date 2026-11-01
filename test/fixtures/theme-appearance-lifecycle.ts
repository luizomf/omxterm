/** A theme run cannot publish or exit before owned resources and PTYs settle. */
export function createThemeCompletion<T>(options: {
  requestClose(): boolean;
  retire(): Promise<boolean>;
  closeWindows(): void;
  joinSessions(): Promise<void>;
  publish(result: T): void;
  quit(): void;
  exit(code: number): void;
  report(error: unknown): void;
}) {
  let completion: Promise<void> | undefined;
  let status = 0;
  const report = (error: unknown) => {
    try {
      options.report(error);
    } catch {
      /* Never replace uncertain ownership. */
    }
  };
  return {
    started: () => completion !== undefined,
    complete(code: number, result?: T): Promise<void> {
      if (code !== 0 && status === 0) status = code;
      if (completion) return completion;
      let resolve!: () => void;
      completion = new Promise<void>((done) => {
        resolve = done;
      });
      try {
        if (!options.requestClose() && status === 0) status = 1;
      } catch (error) {
        if (status === 0) status = 1;
        report(error);
      }
      void (async () => {
        if (!(await options.retire()))
          throw new Error("Theme resources did not settle");
        options.closeWindows();
        await options.joinSessions();
        if (status !== 0) options.exit(status);
        else {
          if (result === undefined) throw new Error("Theme result is missing");
          options.publish(result);
          options.quit();
        }
      })().then(resolve, report);
      // A failed or unknown retirement keeps this owner alive and never exits.
      return completion;
    },
  };
}
