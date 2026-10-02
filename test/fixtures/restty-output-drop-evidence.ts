import {
  OUTPUT_CHECKPOINT_RECORDS,
  OUTPUT_RECORD_BYTES,
  outputCheckpointMarker,
  outputRecord,
} from "./restty-output-checkpoint";

export function assertOutputDropRejection(stderr: string): void {
  const length = /Destination checkpoint 0 record length (\d+)/u.exec(stderr);
  const diagnostic = /copied checkpoint=(\{[^{}\r\n]*\})/u.exec(stderr);
  if (!length || !diagnostic)
    throw new Error("Missing actual copied output-drop rejection evidence");
  const copy = JSON.parse(diagnostic[1]!) as ReturnType<
    typeof outputCheckpointCopyDiagnostic
  >;
  if (
    copy.bodyCodeUnits !== Number(length[1]) ||
    copy.bodyCodeUnits === OUTPUT_CHECKPOINT_RECORDS * OUTPUT_RECORD_BYTES
  )
    throw new Error("Expected a wrong-length copied output checkpoint");
  if (copy.recordIndex !== 100 || copy.recordPresent !== false)
    throw new Error(
      "Expected record 100 absent from the actual copied checkpoint",
    );
  if (copy.neighborsAdjacent !== true)
    throw new Error("Expected copied record 100 neighbors 99 and 101 adjacent");
}

// Read only the actual copy that the unchanged exact validator rejected. Never
// log its contents. Line-break removal is diagnostic, not destination acceptance.
export function outputCheckpointCopyDiagnostic(text: string, batch: number) {
  const begin = outputCheckpointMarker(batch);
  const from = text.indexOf(begin);
  const to = text.indexOf(outputCheckpointMarker(batch, true));
  const body =
    from >= 0 && to >= from + begin.length
      ? text.slice(from + begin.length, to)
      : "";
  const withoutLineBreaks = body.replace(/[\r\n]/gu, "");
  const recordIndex = batch * OUTPUT_CHECKPOINT_RECORDS + 100;
  return {
    bodyCodeUnits: body.length,
    lineFeeds: body.match(/\n/gu)?.length ?? 0,
    carriageReturns: body.match(/\r/gu)?.length ?? 0,
    recordIndex,
    recordPresent: withoutLineBreaks.includes(outputRecord(recordIndex)),
    neighborsAdjacent: withoutLineBreaks.includes(
      outputRecord(recordIndex - 1) + outputRecord(recordIndex + 1),
    ),
  };
}
