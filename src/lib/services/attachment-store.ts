// Attachment metadata (filename/mimeType) is always kept; the actual
// content is stored inline as base64 alongside it — capped per file so a
// stray large attachment can't bloat the messages table — so "Download
// attachment" has something real to serve. Content above the cap is
// dropped but the metadata chip still shows (matches the platform's
// existing "degrade gracefully, stay visible" pattern for research gaps).
const MAX_STORED_ATTACHMENT_BYTES = 8 * 1024 * 1024; // ~8MB per file

export interface StoredAttachment {
  filename: string;
  mimeType: string;
  contentBase64?: string;
}

export function attachmentsForStorage(
  attachments?: Array<{ filename: string; mimeType: string; contentBase64: string }>
): StoredAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((a) => {
    const approxBytes = Math.floor((a.contentBase64.length * 3) / 4);
    return approxBytes <= MAX_STORED_ATTACHMENT_BYTES
      ? { filename: a.filename, mimeType: a.mimeType, contentBase64: a.contentBase64 }
      : { filename: a.filename, mimeType: a.mimeType };
  });
}
