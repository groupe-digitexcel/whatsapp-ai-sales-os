export async function sendWhatsAppText(to: string, body: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error("WhatsApp credentials are missing");

  const res = await fetch(`https://graph.facebook.com/v23.0/${phoneId}/messages`, {
    method: "POST",
    headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"},
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {preview_url: false, body}
    })
  });
  if (!res.ok) {
    let providerCode: string | number | undefined;
    let providerType: string | undefined;
    let providerMessage: string | undefined;
    try {
      const payload = await res.json();
      providerCode = payload?.error?.code;
      providerType = typeof payload?.error?.type === "string" ? payload.error.type.slice(0, 80) : undefined;
      providerMessage = typeof payload?.error?.message === "string" ? payload.error.message.slice(0, 240) : undefined;
    } catch {
      // Do not include an unparsed provider response in logs or thrown errors.
    }
    console.error("[whatsapp-send] Graph API rejected message", {
      httpStatus: res.status,
      providerCode,
      providerType,
      providerMessage
    });
    throw new Error(`WhatsApp send failed with HTTP ${res.status}${providerCode ? " (provider code " + providerCode + ")" : ""}`);
  }
  const payload = await res.json();
  console.info("[whatsapp-send] Graph API accepted message", {
    httpStatus: res.status,
    messageIdPresent: Boolean(payload?.messages?.[0]?.id)
  });
  return payload;
}
