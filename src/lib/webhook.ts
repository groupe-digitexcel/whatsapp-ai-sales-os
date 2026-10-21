import crypto from "crypto";

export function verifyMetaSignature(rawBody: string, signature?: string) {
  // Meta signs the exact raw request body with the app secret. Trim accidental
  // whitespace from a secret pasted into the deployment environment.
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret) {
    console.error("[whatsapp-webhook] META_APP_SECRET is missing in this deployment");
    return false;
  }
  if (!signature?.startsWith("sha256=")) {
    console.error("[whatsapp-webhook] Meta signature header is missing or malformed");
    return false;
  }

  const receivedHex = signature.slice("sha256=".length).trim();
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) {
    console.error("[whatsapp-webhook] Meta signature is not a valid SHA-256 digest");
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const received = Buffer.from(receivedHex, "hex");
  const valid = expected.length === received.length && crypto.timingSafeEqual(expected, received);
  if (!valid) console.error("[whatsapp-webhook] Meta signature mismatch; check that META_APP_SECRET belongs to the Meta app sending this webhook");
  return valid;
}

export function extractTextMessage(payload: any) {
  // Meta can batch multiple entries/changes/messages in one webhook delivery.
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const messages = value?.messages ?? [];
      for (const msg of messages) {
        if (!msg || msg.type !== "text" || !msg.id || !msg.from) continue;
        return {
          messageId: String(msg.id),
          from: String(msg.from),
          text: String(msg.text?.body ?? ""),
          timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString()
        };
      }
    }
  }
  return null;
}
