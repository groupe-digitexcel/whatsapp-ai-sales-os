import crypto from "crypto";

export function verifyMetaSignature(rawBody: string, signature?: string) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return false;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.slice(7);
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received)); }
  catch { return false; }
}

export function extractTextMessage(payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg || msg.type !== "text") return null;
  return {
    messageId: String(msg.id),
    from: String(msg.from),
    text: String(msg.text?.body ?? ""),
    timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString()
  };
}
