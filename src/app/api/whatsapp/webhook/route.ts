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
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
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

  // Idempotency: the same Meta event must never create two replies.
  const {data: existing} = await supabase.from("webhook_events").select("id").eq("event_id", incoming.messageId).maybeSingle();
  if (existing) return NextResponse.json({ok:true, duplicate:true});
  await supabase.from("webhook_events").insert({event_id: incoming.messageId, payload, status:"processing"});

  try {
    const {data: customer} = await supabase.from("customers")
      .upsert({whatsapp_number: incoming.from}, {onConflict:"whatsapp_number"})
      .select("id").single();
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

    const {data: history} = await supabase.from("messages")
      .select("direction,body").eq("conversation_id",conversation.id)
      .order("created_at",{ascending:true}).limit(20);

    const aiHistory = (history ?? []).map((m:any)=>({
      role: m.direction === "inbound" ? "user" as const : "assistant" as const,
      content: m.body
    }));

    const reply = await generateSalesReply(aiHistory, conversation.active_product);
    const wa = await sendWhatsAppText(incoming.from, reply);

    await supabase.from("messages").insert({
      conversation_id: conversation.id, direction:"outbound", body:reply,
      provider_message_id:wa?.messages?.[0]?.id ?? null
    });
    await supabase.from("conversations").update({
      stage:"ENGAGED", last_customer_message_at:incoming.timestamp, updated_at:new Date().toISOString()
    }).eq("id",conversation.id);
    await supabase.from("webhook_events").update({status:"processed",processed_at:new Date().toISOString()}).eq("event_id",incoming.messageId);

    return NextResponse.json({ok:true});
  } catch (e:any) {
    await supabase.from("webhook_events").update({status:"failed",error_message:String(e?.message ?? e)}).eq("event_id",incoming.messageId);
    // Return 200 after recording failure to avoid an uncontrolled retry storm.
    return NextResponse.json({ok:true, handled_error:true});
  }
}
