import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This endpoint is intentionally limited to Meta's official test phone-number ID.
// It cannot send from the connected production business number.
const META_TEST_PHONE_NUMBER_ID = "1347942211742668";

function safeErrorPayload(payload: any) {
  return {
    code: typeof payload?.error?.code === "number" ? payload.error.code : undefined,
    type: typeof payload?.error?.type === "string" ? payload.error.type.slice(0, 80) : undefined,
    message: typeof payload?.error?.message === "string" ? payload.error.message.slice(0, 240) : undefined
  };
}

export async function POST(req: NextRequest) {
  const expectedPassword = process.env.ADMIN_DASHBOARD_PASSWORD;
  const suppliedPassword = req.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  if (!expectedPassword) {
    return NextResponse.json({ ok: false, error: "Admin dashboard is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!suppliedPassword || suppliedPassword !== expectedPassword) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let recipient = "";
  try {
    const body = await req.json();
    recipient = typeof body?.to === "string" ? body.to.replace(/[\\s()+-]/g, "") : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  if (!/^237\\d{9}$/.test(recipient)) {
    return NextResponse.json({ ok: false, error: "Enter a Cameroon WhatsApp number in international format, for example +237 6XX XXX XXX." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return NextResponse.json({ ok: false, error: "WhatsApp API credentials are missing from this deployment." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (phoneId !== META_TEST_PHONE_NUMBER_ID) {
    console.warn("[whatsapp-test-send] blocked because configured phone ID is not the Meta test number", {
      configuredPhoneIdMatchesTest: false
    });
    return NextResponse.json({
      ok: false,
      error: "Safety check stopped the test: production is not configured with the expected Meta test phone number. No message was sent."
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v23.0/${META_TEST_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "template",
        template: {
          name: "hello_world",
          language: { code: "en_US" }
        }
      }),
      cache: "no-store"
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerError = safeErrorPayload(payload);
      console.warn("[whatsapp-test-send] Meta rejected test template", {
        httpStatus: response.status,
        providerCode: providerError.code,
        providerType: providerError.type,
        providerMessage: providerError.message
      });
      return NextResponse.json({
        ok: false,
        error: "Meta rejected the test message.",
        httpStatus: response.status,
        providerError
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    const messageId = typeof payload?.messages?.[0]?.id === "string" ? payload.messages[0].id : null;
    console.info("[whatsapp-test-send] Meta accepted controlled test message", {
      recipientSuffix: recipient.slice(-4),
      messageIdPresent: Boolean(messageId),
      httpStatus: response.status
    });
    return NextResponse.json({
      ok: true,
      result: "accepted_by_meta",
      messageId,
      note: "Meta accepted the template send request. This does not by itself prove delivery or test the inbound AI reply."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[whatsapp-test-send] request failed", {
      errorName: String(error?.name ?? "SEND_FAILED").slice(0, 60)
    });
    return NextResponse.json({ ok: false, error: "Could not reach the WhatsApp Cloud API." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
