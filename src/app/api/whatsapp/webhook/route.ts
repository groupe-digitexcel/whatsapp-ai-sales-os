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

async function processIncomingMessage(supabase: ReturnType<typeof db>, payload: any, incoming: IncomingTextMessage, requestId: string) {
  console.info("[whatsapp-webhook] message_processing_started", { requestId, messageId: incoming.messageId });
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
    console.info("[whatsapp-webhook] database_event_saved", { requestId, messageId: incoming.messageId });

    const { data: customer, error: customerError } = await supabase.from("customers")
      .upsert({
        whatsapp_number: incoming.from,
        language: isFrench(incoming.text) ? "fr" : "en",
        updated_at: new Date().toISOString()
      }, { onConflict: "whatsapp_number" })
      .select("id,marketing_opt_out").single();
    throwDbError("customer_upsert", customerError);
    if (!customer) throw new Error("Customer upsert returned no customer");
    console.info("[whatsapp-webhook] customer_saved", { requestId, messageId: incoming.messageId });

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
    console.info("[whatsapp-webhook] conversation_ready", { requestId, messageId: incoming.messageId });

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
    console.info("[whatsapp-webhook] inbound_message_saved", { requestId, messageId: incoming.messageId, wasAlreadyPresent: Boolean(existingInbound) });

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
    console.info("[whatsapp-webhook] ai_reply_generated", { requestId, messageId: incoming.messageId, replyLength: reply.length });
    console.info("[whatsapp-webhook] whatsapp_send_started", { requestId, messageId: incoming.messageId });
    const wa = await sendWhatsAppText(incoming.from, reply);
    console.info("[whatsapp-webhook] whatsapp_send_accepted", { requestId, messageId: incoming.messageId, providerMessageIdPresent: Boolean(wa?.messages?.[0]?.id) });

    const { error: outboundInsertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id, direction: "outbound", body: reply,
      provider_message_id: wa?.messages?.[0]?.id ?? null, reply_to_provider_message_id: incoming.messageId
    });
    throwDbError("outbound_message_insert", outboundInsertError);
    console.info("[whatsapp-webhook] outbound_message_saved", { requestId, messageId: incoming.messageId });

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
    console.info("[whatsapp-webhook] message_processing_completed", { requestId, messageId: incoming.messageId });
    return { duplicate: false, optedOut: false };
  } catch (error: any) {
    const message = String(error?.message ?? error).slice(0, 500);
    console.error("[whatsapp-webhook] message_processing_failed", {
      requestId,
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
  const requestId = req.headers.get("x-vercel-id") || crypto.randomUUID();
  const startedAt = Date.now();
  const signature = req.headers.get("x-hub-signature-256") ?? undefined;
  console.info("[whatsapp-webhook] request_received", {
    requestId,
    method: req.method,
    path: req.nextUrl.pathname,
    signatureHeaderPresent: Boolean(signature),
    contentType: req.headers.get("content-type") ?? "missing",
    deployment: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12) : "unknown"
  });

  let raw: string;
  try {
    raw = await req.text();
  } catch (error: any) {
    console.error("[whatsapp-webhook] request_body_read_failed", {
      requestId,
      errorName: String(error?.name ?? "BODY_READ_FAILED").slice(0, 60)
    });
    return NextResponse.json({ ok: false, code: "BODY_READ_FAILED", requestId }, {
      status: 400,
      headers: { "Cache-Control": "no-store" }
    });
  }

  console.info("[whatsapp-webhook] request_body_read", { requestId, bodyBytes: Buffer.byteLength(raw, "utf8") });
  const signatureValid = verifyMetaSignature(raw, signature);
  if (!signatureValid) {
    console.warn("[whatsapp-webhook] signature_validation_failed", {
      requestId,
      signatureHeaderPresent: Boolean(signature),
      metaAppSecretConfigured: Boolean(process.env.META_APP_SECRET?.trim()),
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ ok: false, code: "INVALID_SIGNATURE", requestId }, {
      status: 401,
      headers: { "Cache-Control": "no-store" }
    });
  }
  console.info("[whatsapp-webhook] signature_validation_passed", { requestId, durationMs: Date.now() - startedAt });

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    console.warn("[whatsapp-webhook] payload_json_invalid", { requestId, durationMs: Date.now() - startedAt });
    return NextResponse.json({ ok: false, code: "BAD_JSON", requestId }, {
      status: 400,
      headers: { "Cache-Control": "no-store" }
    });
  }

  if (payload.object !== "whatsapp_business_account") {
    console.info("[whatsapp-webhook] unrelated_object_ignored", { requestId, object: typeof payload.object === "string" ? payload.object : "missing" });
    return NextResponse.json({ ok: true });
  }

  const incomingMessages = extractTextMessages(payload);
  console.info("[whatsapp-webhook] payload_parsed", {
    requestId,
    object: payload.object,
    entryCount: Array.isArray(payload.entry) ? payload.entry.length : 0,
    textMessageCount: incomingMessages.length,
    statusChangeCount: Array.isArray(payload.entry) ? payload.entry.reduce((total: number, entry: any) => total + (Array.isArray(entry?.changes) ? entry.changes.reduce((n: number, change: any) => n + (Array.isArray(change?.value?.statuses) ? change.value.statuses.length : 0), 0) : 0), 0) : 0
  });
  // Status callbacks and non-text events are valid Meta deliveries and require no reply.
  if (!incomingMessages.length) {
    console.info("[whatsapp-webhook] valid_event_ignored", { requestId, reason: "no_supported_text_messages", durationMs: Date.now() - startedAt });
    return NextResponse.json({ ok: true, ignored: true });
  }

  let supabase: ReturnType<typeof db>;
  try {
    supabase = db();
  } catch (error: any) {
    console.error("[whatsapp-webhook] supabase_initialization_failed", {
      requestId,
      errorName: String(error?.name ?? "SUPABASE_INIT_FAILED").slice(0, 60),
      errorCode: typeof error?.code === "string" ? error.code.slice(0, 40) : undefined
    });
    return NextResponse.json({ ok: false, code: "SUPABASE_INIT_FAILED", requestId }, { status: 503 });
  }

  let processed = 0;
  let duplicates = 0;
  let failures = 0;
  for (const incoming of incomingMessages) {
    try {
      console.info("[whatsapp-webhook] message_extracted", { requestId, messageId: incoming.messageId, textLength: incoming.text.length });
      const result = await processIncomingMessage(supabase, payload, incoming, requestId);
      if (result.duplicate) duplicates++;
      else processed++;
    } catch {
      failures++;
    }
  }

  const durationMs = Date.now() - startedAt;
  console.info("[whatsapp-webhook] request_completed", { requestId, processed, duplicates, failures, durationMs });
  if (failures) {
    return NextResponse.json({ ok: false, code: "MESSAGE_PROCESSING_FAILED", requestId, processed, duplicates, failures }, {
      status: 500,
      headers: { "Cache-Control": "no-store" }
    });
  }
  return NextResponse.json({ ok: true, requestId, processed, duplicates, durationMs }, {
    headers: { "Cache-Control": "no-store" }
  });
}
