import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const expected = process.env.ADMIN_DASHBOARD_PASSWORD;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected) {
    return NextResponse.json(
      { error: "Admin dashboard is not configured. Add ADMIN_DASHBOARD_PASSWORD to the Vercel Production environment and redeploy." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!supplied || supplied !== expected) return unauthorized();

  try {
    const supabase = db();
    const [customers, conversations, messages, events, followUps, outbox, recentConversations, recentMessages, failedEvents] = await Promise.all([
      supabase.from("customers").select("*", { count: "exact", head: true }),
      supabase.from("conversations").select("*", { count: "exact", head: true }),
      supabase.from("messages").select("*", { count: "exact", head: true }),
      supabase.from("webhook_events").select("*", { count: "exact", head: true }),
      supabase.from("follow_ups").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("outbox_messages").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("conversations").select("id,stage,status,active_product,last_customer_message_at,updated_at,customer:customers(name,whatsapp_number)").order("updated_at", { ascending: false }).limit(12),
      supabase.from("messages").select("id,direction,body,created_at,conversation_id").order("created_at", { ascending: false }).limit(10),
      supabase.from("webhook_events").select("*", { count: "exact", head: true }).eq("status", "failed")
    ]);

    const errors = [customers, conversations, messages, events, followUps, outbox, recentConversations, recentMessages, failedEvents].filter((r) => r.error);
    if (errors.length) {
      console.error("Admin overview query failed", errors.map((r) => r.error?.message));
      return NextResponse.json({ error: "Unable to load dashboard data. Check the database schema and service-role configuration." }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({
      metrics: {
        customers: customers.count ?? 0,
        conversations: conversations.count ?? 0,
        messages: messages.count ?? 0,
        webhookEvents: events.count ?? 0,
        pendingFollowUps: followUps.count ?? 0,
        pendingOutbox: outbox.count ?? 0,
        failedWebhookEvents: failedEvents.count ?? 0
      },
      conversations: recentConversations.data ?? [],
      messages: recentMessages.data ?? [],
      generatedAt: new Date().toISOString()
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin overview error", error);
    return NextResponse.json({ error: "Dashboard request failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
