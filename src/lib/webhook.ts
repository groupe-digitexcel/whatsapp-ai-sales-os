import crypto from "crypto";

export type IncomingTextMessage = {
  messageId: string;
  from: string;
  text: string;
  timestamp: string;
};

export function verifyMetaSignature(rawBody: string, signature?: string) {
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
  if (!valid) {
    console.error("[whatsapp-webhook] Meta signature mismatch; verify that META_APP_SECRET belongs to the Meta app configured for this callback");
  }
  return valid;
}

/** Extract every text message in a Meta delivery; a single delivery can contain multiple messages. */
export function extractTextMessages(payload: any): IncomingTextMessage[] {
  const extracted: IncomingTextMessage[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      for (const msg of value?.messages ?? []) {
        const text = typeof msg?.text?.body === "string" ? msg.text.body.trim() : "";
        if (msg?.type !== "text" || !msg?.id || !msg?.from || !text) continue;
        const seconds = Number(msg.timestamp);
        extracted.push({
          messageId: String(msg.id),
          from: String(msg.from),
          text,
          timestamp: Number.isFinite(seconds) && seconds > 0
            ? new Date(seconds * 1000).toISOString()
            : new Date().toISOString()
        });
      }
    }
  }
  return extracted;
}

// Backward-compatible single-message helper for any other route or test importing it.
export function extractTextMessage(payload: any): IncomingTextMessage | null {
  return extractTextMessages(payload)[0] ?? null;
}
