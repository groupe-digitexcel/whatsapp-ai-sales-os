# WhatsApp AI Sales OS v1

Production-oriented starter for Meta WhatsApp Business Platform + Next.js/Vercel + Supabase.

## Core loop
Meta WhatsApp -> webhook -> signature verification -> idempotency -> Supabase conversation -> AI -> WhatsApp Cloud API -> customer -> webhook again.

## Required setup
1. Create a Supabase project and run `supabase.sql`.
2. Deploy this Next.js project to Vercel.
3. Add `.env` values in Vercel.
4. In Meta, configure the WhatsApp webhook URL:
   `https://YOUR-DOMAIN/api/whatsapp/webhook`
5. Set the same verify token in Meta and `WHATSAPP_VERIFY_TOKEN`.
6. Subscribe the WhatsApp Business Account to message events.
7. Test with a real customer message.
8. Check Vercel runtime logs and Supabase `webhook_events` / `messages`.

## Important
- Keep secrets server-side only.
- Do not put the WhatsApp access token in client code.
- Do not claim a payment succeeded unless a trusted payment signal confirms it.
- Follow Meta's current messaging-window/template rules for business-initiated follow-ups.
- This v1 uses direct outbound sends for the immediate reply. The `outbox_messages` table is prepared for a separate retry dispatcher in the next hardening pass.

## Test sequence
Customer: "How much is BookScanPro?"
Agent answers.
Customer: "I don't have money now."
Agent answers again.
Customer: "Friday."
Agent can continue because the same webhook and conversation record are reused.
