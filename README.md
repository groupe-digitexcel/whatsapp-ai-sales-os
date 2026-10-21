# Kingdom AI Academy WhatsApp AI Sales OS

Independent WhatsApp-based sales funnel for Kingdom AI Academy.

## Architecture and integration
- **WhatsApp Sales OS:** receives Meta webhook events, verifies Meta signatures, manages the prospect conversation, records CRM messages, generates sales replies, and sends replies through the WhatsApp Cloud API.
- **Academy website:** the OS reads the public `/api/public/sales-info` endpoint for current published course, eligible cohort, price, promotion, and remaining-capacity facts. Results are cached briefly and the assistant falls back safely if the API is unavailable.
- **Registration and payment:** prospects are directed to the official registration page. The public sales-info API does not report an individual person's registration or payment status; the OS must never claim that a prospect registered or paid unless a separate verified integration is implemented.
- **Supabase:** stores customers, conversations, messages, webhook events, opt-outs, and queued follow-up records. The service-role key must remain server-side.

## Official destinations
- Website: `https://kingdom-ai-academy.vercel.app`
- Sales information API: `https://kingdom-ai-academy.vercel.app/api/public/sales-info`
- Registration: `https://kingdom-ai-academy.vercel.app/auth/register?utm_source=whatsapp&utm_medium=chat&utm_campaign=academy_admissions`
- Meta webhook callback: `https://whatsapp-ai-sales-os.vercel.app/api/whatsapp/webhook`

## AI operation
- OpenAI is supported through `OPENAI_API_KEY` and `OPENAI_MODEL`; optional Gemini, Groq, and OpenRouter providers are tried as fallbacks.
- `SALES_AI_MODE=test` enables deterministic test replies only. Leave it unset for adaptive AI replies.
- If all configured AI providers fail, the assistant uses a safe scripted reply that avoids inventing prices or promotions.

## Webhook processing
- GET verifies Meta's subscription challenge using `WHATSAPP_VERIFY_TOKEN` (or the legacy `META_VERIFY_TOKEN`).
- POST verifies `x-hub-signature-256` against the exact raw body using `META_APP_SECRET`.
- Every text message in a delivery is processed, and Meta message IDs provide idempotency.
- Failed processing is recorded where possible and returns a retryable error; duplicate processed messages are not answered twice.
- Status callbacks and non-text events are acknowledged without creating customer conversations.

## Consent and follow-up safety
- Supported STOP/unsubscribe phrases set `marketing_opt_out` and cancel pending follow-ups and queued promotional messages.
- Customer-initiated support replies remain allowed after opting out.
- Automatic scheduled follow-up is not considered complete until a real scheduler/dispatcher is implemented, tested, and confirmed to enforce opt-out and Meta's messaging-window/template requirements.
- Never ask for passwords, mobile-money PINs, OTPs, or other security codes. Never use fabricated urgency, religious pressure, or false claims about enrollment/payment.

## Diagnostics and launch checks
- Open `/api/health` to check safe environment-variable presence, Supabase table reachability, and connectivity to the Academy sales-info API. It does not expose secrets and cannot prove that Meta accepts the signature or that WhatsApp delivery succeeds.
- Open `/admin` for the CRM overview and `/admin/customers` for customer history. Both require `ADMIN_DASHBOARD_PASSWORD`.
- Send controlled French and English WhatsApp messages and verify the reply, Supabase records, and Meta delivery status before launch.
- Test price/discount questions against live Academy data, objections, STOP, and a new customer-initiated question after STOP.
- Do not claim production readiness until the actual Meta-connected message round trip succeeds.
- Keep the existing Digit-Excel5G WhatsApp Business number untouched while testing the new Sales OS with Meta's test number.
