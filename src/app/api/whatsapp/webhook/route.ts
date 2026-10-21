import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/supabase";
import { extractTextMessages, verifyMetaSignature, type IncomingTextMessage } from "@/src/lib/webhook";
import { generateSalesReply } from "@/src/lib/sales-agent";
import { sendWhatsAppText } from "@/src/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function classifySalesStage(customerText: string, assistantText: string): { stage: string; objectionType: string | null } {
  const text = customerText.toLowerCase();
  const hasRegistrationIntent = /inscri|register|enroll|enrol|paiement|payment|pay now|je veux payer|je veux m'inscrire|lien|link/.test(text);
  const objectionPatterns: Array<[RegExp, string]> = [
    [/trop cher|cher|prix|co[uû]t|budget|expensive|can't afford|cannot afford|price|fee/, "price"],
    [/pas le temps|manque de temps|busy|no time|schedule|horaire/, "time"],
    [/peur|difficile|compliqu|beginner|débutant|not technical|not sure i can|pas capable/, "confidence"],
    [/fiable|arnaque|scam|legitimate|trust|accr[eé]dit|is it real/, "trust"],
    [/r[eé]fl[eé]chir|think about|not sure|je ne sais pas|maybe later|plus tard|consult/, "hesitation"],
  ];
  const objection = objectionPatterns.find(([pattern]) => pattern.test(text));
  if (hasRegistrationIntent) return { stage: "READY_TO_REGISTER", objectionType: null };
  if (objection) return { stage: "OBJECTION", objectionType: objection[1] };
  if (/https:\/\/kingdom-ai-academy\.vercel\.app\/auth\/register/.test(assistantText)) {
    return { stage: "LINK_SENT", objectionType: null };
  }
  if (/bonjour|hello|hi\b|bonsoir|good morning|good evening/.test(text)) {
    return { stage: "DISCOVERY", objectionType: null };
  }
  return { stage: "ENGAGED", objectionType: null };
}

function isFrench(text: string) {
  return /bonjour|bonsoir|merci|prix|combien|co[uû]t|inscri|formation|cours|paiement|fran[cç]ais|je veux|je suis|s'il vous plaît|svp/.test(text.toLowerCase());
}

function throwDbError(step: string, error: { code?: string; message?: string } | null | undefined) {
  if (error) {
    console.error("[whatsapp-webhook] Database operation failed", {
      step,
      code: error.code ?? "UNKNOWN",
      message: error.message ?? "Unknown database error"
    });
    throw new Error(step + " failed (" + (error.code ?? "UNKNOWN") + ")");
  }
}

async function processIncomingMessage(supabase: ReturnType<typeof db>, payload: any, incoming: IncomingTextMessage) {
  let eventRegistered = false;
  try {
    const { data: existing, error: lookupError } = await supabase.from("webhook_events")
      .select("id,status,received_at").eq("event_id", incoming.messageId).maybeSingle();
    throwDbError("event_lookup", lookupError);

    if (existing) {
      const ageMs = Date.now() - new Date(existing.received_at).getTime();
      if (existing.status === "processed" || (existing.status === "processing" && ageMs < 5 * 60 * 1000)) {
        return { duplicate: true };
      }
      const { error: retryError } = await supabase.from("webhook_events").update({
        payload, status: "processing", error_message: null, processed_at: null, received_at: new Date().toISOString()
      }).eq("event_id", incoming.messageId);
      throwDbError("event_retry_registration", retryError);
      eventRegistered = true;
    } else {
      const { error: insertEventError } = await supabase.from("webhook_events")
        .insert({ event_id: incoming.messageId, payload, status: "processing" });
      if (insertEventError?.code === "23505") return { duplicate: true };
      throwDbError("event_registration", insertEventError);
      eventRegistered = true;
    }

    const { data: customer, error: customerError } = await supabase.from("customers")
      .upsert({
        whatsapp_number: incoming.from,
        language: isFrench(incoming.text) ? "fr" : "en",
        updated_at: new Date().toISOString()
      }, { onConflict: "whatsapp_number" })
      .select("id,marketing_opt_out").single();
    throwDbError("customer_upsert", customerError);
    if (!customer) throw new Error("Customer upsert returned no customer");

    const { data: foundConversation, error: conversationLookupError } = await supabase.from("conversations")
      .select("*").eq("customer_id", customer.id).eq("status", "open").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    throwDbError("conversation_lookup", conversationLookupError);

    let conversation = foundConversation;
    if (!conversation) {
      const created = await supabase.from("conversations")
        .insert({ customer_id: customer.id, stage: "NEW", status: "open" })
        .select("*").single();
      throwDbError("conversation_create", created.error);
      conversation = created.data;
    }
    if (!conversation) throw new Error("Conversation creation returned no row");

    // Meta may retry a delivery after a later step fails. Reuse the original inbound
    // row rather than letting the unique provider-message index block recovery.
    const { data: existingInbound, error: inboundLookupError } = await supabase.from("messages")
      .select("id").eq("provider_message_id", incoming.messageId).maybeSingle();
    throwDbError("inbound_message_lookup", inboundLookupError);
    if (!existingInbound) {
      const { error: inboundInsertError } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        direction: "inbound",
        body: incoming.text,
        provider_message_id: incoming.messageId,
        created_at: incoming.timestamp
      });
      throwDbError("inbound_message_insert", inboundInsertError);
    }

    // If an outbound reply was already persisted for this inbound message, finish
    // the event without sending the same answer twice on a Meta retry.
    const { data: existingReply, error: replyLookupError } = await supabase.from("messages")
      .select("id").eq("reply_to_provider_message_id", incoming.messageId).maybeSingle();
    throwDbError("reply_idempotency_lookup", replyLookupError);
    if (existingReply) {
      const { error: alreadyProcessedError } = await supabase.from("webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString(), error_message: null })
        .eq("event_id", incoming.messageId);
      throwDbError("mark_retried_event_processed", alreadyProcessedError);
      return { duplicate: true };
    }

    const stopRequested = /^(stop|stop all|unsubscribe|unsub|cancel|no more messages|do not message|don't message|arr[eê]te(?:z)?|arr[eê]ter|désabonn(?:e|ez|er|ement)?|ne plus m'envoyer de messages|ne m'envoyez plus de messages)$/i.test(incoming.text.trim());
    if (stopRequested) {
      const { error: optOutError } = await supabase.from("customers")
        .update({ marketing_opt_out: true, marketing_consent_at: null, marketing_consent_source: null, updated_at: new Date().toISOString() })
        .eq("id", customer.id);
      throwDbError("save_marketing_opt_out", optOutError);

      const { error: followUpCancelError } = await supabase.from("follow_ups")
        .update({ status: "cancelled" }).eq("conversation_id", conversation.id).eq("status", "pending");
      throwDbError("cancel_follow_ups", followUpCancelError);

      const { error: outboxCancelError } = await supabase.from("outbox_messages")
        .update({ status: "cancelled", last_error: "Contact opted out of proactive messaging" })
        .eq("conversation_id", conversation.id).eq("status", "pending");
      throwDbError("cancel_outbox_messages", outboxCancelError);

      const confirmation = "You are unsubscribed from promotional messages. No further promotional messages will be sent. If you message us again, we may still reply to your request.\n\nVous êtes désabonné(e) des messages promotionnels. Aucun autre message promotionnel ne sera envoyé. Si vous nous écrivez à nouveau, nous pourrons répondre à votre demande.";
      const wa = await sendWhatsAppText(incoming.from, confirmation);
      const { error: outboundInsertError } = await supabase.from("messages").insert({
        conversation_id: conversation.id, direction: "outbound", body: confirmation,
        provider_message_id: wa?.messages?.[0]?.id ?? null, reply_to_provider_message_id: incoming.messageId
      });
      throwDbError("opt_out_confirmation_insert", outboundInsertError);
      const { error: eventProcessedError } = await supabase.from("webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString(), error_message: null })
        .eq("event_id", incoming.messageId);
      throwDbError("mark_opt_out_event_processed", eventProcessedError);
      return { duplicate: false, optedOut: true };
    }

    const { data: history, error: historyError } = await supabase.from("messages")
      .select("direction,body").eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true }).limit(20);
    throwDbError("load_conversation_history", historyError);

    const aiHistory = (history ?? []).map((message: any) => ({
      role: message.direction === "inbound" ? "user" as const : "assistant" as const,
      content: message.body
    }));
    const reply = await generateSalesReply(aiHistory, conversation.active_product);
    const wa = await sendWhatsAppText(incoming.from, reply);

    const { error: outboundInsertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id, direction: "outbound", body: reply,
      provider_message_id: wa?.messages?.[0]?.id ?? null, reply_to_provider_message_id: incoming.messageId
    });
    throwDbError("outbound_message_insert", outboundInsertError);

    const funnelState = classifySalesStage(incoming.text, reply);
    const { error: conversationUpdateError } = await supabase.from("conversations").update({
      stage: funnelState.stage,
      objection_type: funnelState.objectionType,
      last_customer_message_at: incoming.timestamp,
      updated_at: new Date().toISOString()
    }).eq("id", conversation.id);
    throwDbError("conversation_update", conversationUpdateError);

    const { error: eventProcessedError } = await supabase.from("webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), error_message: null })
      .eq("event_id", incoming.messageId);
    throwDbError("mark_event_processed", eventProcessedError);
    return { duplicate: false, optedOut: false };
  } catch (error: any) {
    const message = String(error?.message ?? error).slice(0, 500);
    console.error("[whatsapp-webhook] Message processing failed", {
      messageId: incoming.messageId,
      step: message
    });
    if (eventRegistered) {
      const { error: markFailedError } = await supabase.from("webhook_events")
        .update({ status: "failed", error_message: message }).eq("event_id", incoming.messageId);
      if (markFailedError) {
        console.error("[whatsapp-webhook] Could not mark event failed", {
          code: markFailedError.code,
          message: markFailedError.message
        });
      }
    }
    throw error;
  }
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const expectedToken = (process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN)?.trim();
  if (mode === "subscribe" && expectedToken && token === expectedToken) {
    return new NextResponse(challenge ?? "", { status: 200, headers: { "Cache-Control": "no-store" } });
  }
  return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256") ?? undefined)) {
    return new NextResponse("Invalid signature", { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  if (payload.object !== "whatsapp_business_account") return NextResponse.json({ ok: true });

  const incomingMessages = extractTextMessages(payload);
  console.info("[whatsapp-webhook] signature accepted", {
    object: payload.object,
    entryCount: Array.isArray(payload.entry) ? payload.entry.length : 0,
    textMessageCount: incomingMessages.length
  });
  // Status callbacks and non-text events are valid Meta deliveries and require no reply.
  if (!incomingMessages.length) return NextResponse.json({ ok: true, ignored: true });

  let supabase: ReturnType<typeof db>;
  try {
    supabase = db();
  } catch (error: any) {
    console.error("[whatsapp-webhook] Supabase client initialization failed", {
      message: String(error?.message ?? error)
    });
    return NextResponse.json({ ok: false, code: "SUPABASE_INIT_FAILED" }, { status: 503 });
  }

  let processed = 0;
  let duplicates = 0;
  let failures = 0;
  for (const incoming of incomingMessages) {
    try {
      const result = await processIncomingMessage(supabase, payload, incoming);
      if (result.duplicate) duplicates++;
      else processed++;
    } catch {
      failures++;
    }
  }

  if (failures) {
    return NextResponse.json({ ok: false, processed, duplicates, failures }, { status: 500 });
  }
  return NextResponse.json({ ok: true, processed, duplicates });
}
