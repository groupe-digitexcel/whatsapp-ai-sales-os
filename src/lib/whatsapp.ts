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
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
  return res.json();
}
