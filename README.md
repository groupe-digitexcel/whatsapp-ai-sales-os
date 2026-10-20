# Kingdom AI Academy WhatsApp Assistant

Next.js + Vercel + Supabase integration for the official Kingdom AI Academy WhatsApp admissions assistant.

## Current scope
- Respond only about Kingdom AI Academy's practical bilingual AI course.
- Confirmed standard fee: **60,000 FCFA**. Do not quote a promotion unless the Academy team has confirmed the current offer.
- Registration information: https://kingdom-ai-academy.vercel.app/
- Replies are intended to follow the customer's language (French or English).
- Keep Meta and Supabase secrets server-side in Vercel environment variables.

## Webhook
Configure Meta to call:
`https://YOUR-DEPLOYMENT-DOMAIN/api/whatsapp/webhook`

Set the same verify token in Meta and Vercel's `WHATSAPP_VERIFY_TOKEN`. The webhook validates `x-hub-signature-256` using `META_APP_SECRET`, records message IDs for idempotency, and stores conversations and messages in Supabase.

## Opt-out behavior
- The exact STOP/unsubscribe phrases supported by the webhook mark the contact as opted out.
- The handler attempts to cancel pending `follow_ups` and queued `outbox_messages`, then sends a bilingual confirmation.
- Opting out should suppress all proactive marketing. Customer-initiated support may still be answered.
- Any future follow-up scheduler or outbox dispatcher MUST check `customers.marketing_opt_out` immediately before sending and must obey Meta's messaging-window/template requirements.
- This repository does not yet provide a verified scheduled-message dispatcher. Do not assume that pending queue records will be sent or that all future senders already enforce opt-out.

## Safe test sequence
1. Confirm the latest Vercel deployment is READY and identify its assigned URL.
2. Confirm Meta webhook verification succeeds without exposing the verify token.
3. Send a controlled French question about the course; verify one reply and a matching Supabase message record.
4. Send an English question; verify the response is Academy-only and the standard fee is 60,000 FCFA.
5. Send `STOP`; verify `customers.marketing_opt_out = true`, pending follow-ups/outbox rows are cancelled, and the bilingual confirmation is recorded.
6. Send a new customer-initiated question; verify support can still respond.
7. Check Vercel runtime logs and Supabase `webhook_events` for failed processing.

Do not claim the integration is production-ready until these tests pass against the actual Meta-connected number. Keep the existing WhatsApp Business number connected; do not migrate it as part of testing.
