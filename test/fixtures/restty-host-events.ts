export async function exerciseResttyEvents(options: {
  readonly deliverOutput: (data: string) => void;
  readonly input: () => string;
  readonly eventCount: () => {
    readonly titles: number;
    readonly bells: number;
  };
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}): Promise<{ readonly titleQueryReplyBytes: number }> {
  for (const chunk of [..."\u001b]0;first-title\u0007"])
    options.deliverOutput(chunk);
  options.deliverOutput("\u0007");
  options.deliverOutput(`\u001b]2;\ufeff${"z".repeat(256)}\u0007`);
  options.deliverOutput("\u001b]2;cancelled\u0018");
  options.deliverOutput("\u001b]malformed\u0007");
  await options.waitFor(() => {
    const count = options.eventCount();
    return count.titles === 2 && count.bells === 1;
  }, "first parsed title, overlong evidence and bell callbacks");

  const beforeTitleQuery = options.input().length;
  options.deliverOutput("\u001b[20t\u001b[21t");
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    titleQueryReplyBytes: options.input().length - beforeTitleQuery,
  };
}
