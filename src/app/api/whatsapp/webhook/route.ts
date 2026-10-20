import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/supabase";
import { extractTextMessage, verifyMetaSignature } from "@/src/lib/webhook";
import { generateSalesReply } from "@/src/lib/sales-agent";
import { sendWhatsAppText } from "@/src/lib/whatsapp";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;
  if (mode === "subscribe" && expectedToken && token === expectedToken) {
    return new NextResponse(challenge ?? "", {status:200});
  }
  return new NextResponse("Forbidden", {status:403});
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256") ?? undefined)) {
    return new NextResponse("Invalid signature", {status:401});
  }

  let payload:any;
  try { payload = JSON.parse(raw); } catch { return new NextResponse("Bad JSON",{status:400}); }
  if (payload.object !== "whatsapp_business_account") return NextResponse.json({ok:true});

  const incoming = extractTextMessage(payload);
  if (!incoming) return NextResponse.json({ok:true});

  const supabase = db();

  // Idempotency: do not reply twice to the same Meta message, including concurrent deliveries.
  const {data: existing, error: lookupError} = await supabase.from("webhook_events")
    .select("id").eq("event_id", incoming.messageId).maybeSingle();
  if (lookupError) return NextResponse.json({ok:false, error:"Event lookup failed"}, {status:503});
  if (existing) return NextResponse.json({ok:true, duplicate:true});
  const {error: insertEventError} = await supabase.from("webhook_events")
    .insert({event_id: incoming.messageId, payload, status:"processing"});
  if (insertEventError) {
    if (insertEventError.code === "23505") return NextResponse.json({ok:true, duplicate:true});
    return NextResponse.json({ok:false, error:"Event registration failed"}, {status:503});
  }

  try {
    const {data: customer} = await supabase.from("customers")
      .upsert({whatsapp_number: incoming.from}, {onConflict:"whatsapp_number"})
      .select("id,marketing_opt_out").single();
    if (!customer) throw new Error("Customer creation failed");

    let {data: conversation} = await supabase.from("conversations")
      .select("*").eq("customer_id", customer.id).eq("status","open").maybeSingle();
    if (!conversation) {
      const created = await supabase.from("conversations")
        .insert({customer_id: customer.id, stage:"NEW", status:"open"})
        .select("*").single();
      conversation = created.data;
    }
    if (!conversation) throw new Error("Conversation creation failed");

    await supabase.from("messages").insert({
      conversation_id: conversation.id, direction:"inbound", body:incoming.text,
      provider_message_id:incoming.messageId, created_at:incoming.timestamp
    });

    // Honor explicit STOP requests. Opt-out suppresses proactive messages, not customer-initiated support.
    const stopRequested = /^(stop|stop all|unsubscribe|unsub|cancel|no more messages|do not message|don't message|arr[eê]te(?:z)?|arr[eê]ter|désabonn(?:e|ez|er|ement)?|ne plus m'envoyer de messages|ne m'envoyez plus de messages)$/i.test(incoming.text.trim());
    if (stopRequested) {
      const {error: optOutError} = await supabase.from("customers")
        .update({marketing_opt_out:true, marketing_consent_at:null, marketing_consent_source:null, updated_at:new Date().toISOString()})
        .eq("id", customer.id);
      if (optOutError) throw new Error("Could not save marketing opt-out");
      const {error: followUpCancelError} = await supabase.from("follow_ups")
        .update({status:"cancelled"}).eq("conversation_id", conversation.id).eq("status","pending");
      if (followUpCancelError) throw new Error("Could not cancel pending follow-ups");
      const {error: outboxCancelError} = await supabase.from("outbox_messages")
        .update({status:"cancelled", last_error:"Contact opted out of proactive messaging"})
        .eq("conversation_id", conversation.id).eq("status","pending");
      if (outboxCancelError) throw new Error("Could not cancel queued messages");
      const confirmation = "You are unsubscribed from promotional messages. No further promotional messages will be sent. If you message us again, we may still reply to your request.\n\nVous êtes désabonné(e) des messages promotionnels. Aucun autre message promotionnel ne sera envoyé. Si vous nous écrivez à nouveau, nous pourrons répondre à votre demande.";
      const wa = await sendWhatsAppText(incoming.from, confirmation);
      await supabase.from("messages").insert({
        conversation_id: conversation.id, direction:"outbound", body:confirmation,
        provider_message_id:wa?.messages?.[0]?.id ?? null
      });
      await supabase.from("webhook_events").update({status:"processed",processed_at:new Date().toISOString()}).eq("event_id",incoming.messageId);
      return NextResponse.json({ok:true, opted_out:true});
    }

    const {data: history} = await supabase.from("messages")
      .select("direction,body").eq("conversation_id",conversation.id)
      .order("created_at",{ascending:true}).limit(20);

    const aiHistory = (history ?? []).map((m:any)=>({
      role: m.direction === "inbound" ? "user" as const : "assistant" as const,
      content: m.body
    }));

    // The sales assistant is independent of the Academy platform API. It shares the public registration link when appropriate.
    const reply = await generateSalesReply(aiHistory, conversation.active_product);
    const wa = await sendWhatsAppText(incoming.from, reply);

    await supabase.from("messages").insert({
      conversation_id: conversation.id, direction:"outbound", body:reply,
      provider_message_id:wa?.messages?.[0]?.id ?? null
    });
    const funnelState = classifySalesStage(incoming.text, reply);
    await supabase.from("conversations").update({
      stage: funnelState.stage,
      objection_type: funnelState.objectionType,
      last_customer_message_at:incoming.timestamp,
      updated_at:new Date().toISOString()
    }).eq("id",conversation.id);
    await supabase.from("webhook_events").update({status:"processed",processed_at:new Date().toISOString()}).eq("event_id",incoming.messageId);

    return NextResponse.json({ok:true});
  } catch (e:any) {
    await supabase.from("webhook_events").update({status:"failed",error_message:String(e?.message ?? e)}).eq("event_id",incoming.messageId);
    // Return 200 after recording failure to avoid an uncontrolled retry storm.
    return NextResponse.json({ok:true, handled_error:true});
  }
}
