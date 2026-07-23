// Client-side counterpart to ndjson-server.ts — reads a streamed NDJSON
// response line by line, calling onProgress for every non-terminal event and
// resolving with the payload of the final {"type":"done"} line. Throws if
// the stream ends with {"type":"error"} or ends without a "done" line.
export async function readNdjsonStream<T>(res: Response, onProgress: (event: { type: string; [k: string]: unknown }) => void): Promise<T> {
  if (!res.body) throw new Error("No response body to stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | undefined;
  let resultSet = false;
  let errorMsg: string | undefined;

  function handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: { type: string; [k: string]: unknown };
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (event.type === "done") {
      result = event.result as T;
      resultSet = true;
    } else if (event.type === "error") {
      errorMsg = typeof event.error === "string" ? event.error : "Something went wrong";
    } else {
      onProgress(event);
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      handleLine(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
    }
  }
  if (buffer) handleLine(buffer);

  if (errorMsg) throw new Error(errorMsg);
  if (!resultSet) throw new Error("Stream ended without a result");
  return result as T;
}
