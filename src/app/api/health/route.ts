import { NextResponse } from "next/server";
import { db } from "@/src/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const env = {
    supabaseUrl: Boolean(process.env.SUPABASE_URL),
    supabaseServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    metaAppSecret: Boolean(process.env.META_APP_SECRET?.trim()),
    whatsappVerifyToken: Boolean((process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN)?.trim()),
    whatsappAccessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    whatsappPhoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    aiProvider: Boolean(
      process.env.OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.OPENROUTER_API_KEY
    ),
    adminPassword: Boolean(process.env.ADMIN_DASHBOARD_PASSWORD),
    academySalesInfoUrlConfigured: Boolean(process.env.ACADEMY_SALES_INFO_URL || true),
  };

  let academySalesInfoReachable = false;
  let academyCourseAvailable: boolean | null = null;
  try {
    const response = await fetch(process.env.ACADEMY_SALES_INFO_URL || "https://kingdom-ai-academy.vercel.app/api/public/sales-info", {
      cache: "no-store", signal: AbortSignal.timeout(3500)
    });
    if (response.ok) {
      const info = await response.json();
      academySalesInfoReachable = info?.ok === true && typeof info?.available === "boolean";
      academyCourseAvailable = typeof info?.available === "boolean" ? info.available : null;
    }
  } catch {
    academySalesInfoReachable = false;
  }

  let databaseReachable = false;
  let databaseErrorCode: string | null = null;
  try {
    const client = db();
    const { error } = await client.from("webhook_events").select("id", { count: "exact", head: true });
    databaseReachable = !error;
    databaseErrorCode = error?.code ?? null;
  } catch (error: any) {
    databaseErrorCode = String(error?.message ?? "DATABASE_CHECK_FAILED").slice(0, 80);
  }

  const requiredConfigured =
    env.supabaseUrl &&
    env.supabaseServiceKey &&
    env.metaAppSecret &&
    env.whatsappVerifyToken &&
    env.whatsappAccessToken &&
    env.whatsappPhoneNumberId &&
    env.aiProvider;

  const ok = requiredConfigured && databaseReachable && academySalesInfoReachable;
  return NextResponse.json({
    ok,
    service: "whatsapp-ai-sales-os",
    status: ok ? "ready-for-live-message-test" : "configuration-or-database-check-failed",
    checks: { ...env, databaseReachable, academySalesInfoReachable, academyCourseAvailable },
    databaseErrorCode,
    note: "This endpoint reports configuration presence, database reachability, and public Academy sales-info API connectivity. It does not prove Meta signature verification, WhatsApp delivery, or individual registration/payment status.",
    time: new Date().toISOString()
  }, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
