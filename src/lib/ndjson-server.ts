// Streams progress events to the client while a long-running research
// pipeline runs (Add Firm, Populate), instead of leaving the request bar
// looking frozen for 10-30+ seconds. Each line is one JSON object; the
// stream always ends with either {"type":"done","result":...} or
// {"type":"error","error":...}. Auth/permission failures happen before this
// is called, so they still return normal NextResponse.json with a real
// HTTP status — only the actual work is streamed as 200 + NDJSON body.
export function ndjsonResponse(run: (send: (event: { type: string; [k: string]: unknown }) => void) => Promise<unknown>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: { type: string; [k: string]: unknown }) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        const result = await run(send);
        send({ type: "done", result });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
