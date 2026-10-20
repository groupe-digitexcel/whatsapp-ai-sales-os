import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.ADMIN_DASHBOARD_PASSWORD;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected) return NextResponse.json({ error: "Admin dashboard is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!supplied || supplied !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const query = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
  const supabase = db();
  let customerQuery = supabase.from("customers")
    .select("id,name,whatsapp_number,language,marketing_opt_out,created_at,updated_at")
    .order("updated_at", { ascending: false }).limit(100);
  if (query) {
    const digits = query.replace(/[^0-9+]/g, "");
    customerQuery = customerQuery.or(`name.ilike.%${query.replace(/[,%()]/g, "")}%,whatsapp_number.ilike.%${digits}%`);
  }
  const { data: customers, error } = await customerQuery;
  if (error) {
    console.error("CRM customer query failed", error.message);
    return NextResponse.json({ error: "Could not load customers." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  const ids = (customers ?? []).map((customer) => customer.id);
  const { data: conversations, error: conversationError } = ids.length
    ? await supabase.from("conversations").select("id,customer_id,stage,status,active_product,last_customer_message_at,updated_at").in("customer_id", ids).order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (conversationError) {
    console.error("CRM conversations query failed", conversationError.message);
    return NextResponse.json({ error: "Could not load customer conversations." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  const conversationIds = (conversations ?? []).map((conversation) => conversation.id);
  const { data: messages, error: messagesError } = conversationIds.length
    ? await supabase.from("messages").select("id,conversation_id,direction,body,created_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(500)
    : { data: [], error: null };
  if (messagesError) {
    console.error("CRM messages query failed", messagesError.message);
    return NextResponse.json({ error: "Could not load message history." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const conversationsByCustomer = new Map<string, any[]>();
  for (const conversation of conversations ?? []) {
    const existing = conversationsByCustomer.get(conversation.customer_id) ?? [];
    existing.push({ ...conversation, messages: (messages ?? []).filter((message) => message.conversation_id === conversation.id).slice(0, 20) });
    conversationsByCustomer.set(conversation.customer_id, existing);
  }
  return NextResponse.json({
    customers: (customers ?? []).map((customer) => ({
      ...customer,
      conversations: conversationsByCustomer.get(customer.id) ?? [],
    })),
    generatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
