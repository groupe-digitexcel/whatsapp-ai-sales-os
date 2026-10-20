# Kingdom AI Academy WhatsApp AI Sales OS

Independent WhatsApp-based sales funnel for Kingdom AI Academy. This project is separate from the Academy student platform.

## Purpose
The assistant welcomes prospects, discovers their goals, explains relevant course value, handles objections honestly, and guides interested people to the Academy's public registration and payment page.

## Architecture boundary
- **This repository:** WhatsApp conversation, sales strategy, prospect/conversation records, opt-out handling, and sales-funnel behavior.
- **Academy website:** public course information, registration, checkout/payment, and enrollment.
- The WhatsApp assistant does **not** act as a student tutor, student dashboard, enrollment manager, or embedded Academy feature.
- The WhatsApp webhook does not call the Academy's internal or public sales-info API. It uses the public registration URL as the hand-off destination.
- Current fee, promotions, available cohorts, payment instructions and other changing details must be checked on the official registration page. The assistant must not guess or fabricate them.

## Public registration destination
`https://kingdom-ai-academy.vercel.app/auth/register?utm_source=whatsapp&utm_medium=chat&utm_campaign=academy_admissions`

The public Academy website is the source of truth for current offer and checkout details.

## Sales conversation
1. Welcome in French or English.
2. Discover the prospect's goal and relevant context, one question at a time.
3. Match the course's practical value to that goal.
4. Handle the specific objection with truthful, non-coercive answers.
5. Invite the prospect to register when they show readiness.
6. Respect a clear refusal and all opt-out requests.

Do not invent prices, promotions, deadlines, seat counts, accreditation, testimonials, payment success, or enrollment status. Never ask for passwords, mobile-money PINs or OTPs.

## Webhook
Configure Meta to call:
`https://YOUR-DEPLOYMENT-DOMAIN/api/whatsapp/webhook`

Set the same verify token in Meta and Vercel's `WHATSAPP_VERIFY_TOKEN`. The webhook validates `x-hub-signature-256` using `META_APP_SECRET`, records message IDs for idempotency, and stores conversations and messages in Supabase.

## Opt-out behavior
- Supported STOP/unsubscribe phrases mark the contact as opted out.
- The handler attempts to cancel pending `follow_ups` and queued `outbox_messages`, then sends a bilingual confirmation.
- Opting out must suppress proactive marketing. Customer-initiated messages may still receive a response.
- **Automatic scheduled follow-up is not considered complete** until a real scheduler/dispatcher is implemented, tested, and confirmed to enforce opt-out and Meta's messaging-window/template requirements. Do not claim that queued follow-ups are being sent unless that dispatcher exists and is verified.

## Verification checklist
1. Confirm the latest Vercel deployment is READY.
2. Confirm Meta webhook verification succeeds without exposing the verify token.
3. Send controlled French and English messages and verify replies follow the prospect's language and the sales funnel.
4. Test course-price and promotion questions: the assistant must direct prospects to the official registration page rather than invent a fee.
5. Test an objection (for example, cost or lack of experience) and confirm the response addresses that exact concern.
6. Send `STOP`; verify opt-out is stored, pending follow-ups/outbox rows are cancelled, and a bilingual confirmation is recorded.
7. Send a new customer-initiated question and verify that the assistant can still respond.
8. Check Vercel runtime logs and Supabase `webhook_events` for failed processing.

Do not claim production readiness until these tests pass against the actual Meta-connected number. Keep the existing WhatsApp Business number connected; do not migrate it as part of testing.
