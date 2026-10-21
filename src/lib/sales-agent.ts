import { generateWithFreeRouter } from "./free-router";
import { PRODUCTS } from "./products";

type HistoryMessage = { role: "user" | "assistant"; content: string };

const SITE_URL = PRODUCTS.kingdom_ai_academy.siteUrl;
const REGISTRATION_URL = PRODUCTS.kingdom_ai_academy.registrationUrl;
const SALES_INFO_URL = process.env.ACADEMY_SALES_INFO_URL || PRODUCTS.kingdom_ai_academy.salesInfoUrl;

type AcademySalesInfo = {
  ok: boolean;
  available: boolean;
  course?: {
    titleEn?: string | null;
    titleFr?: string | null;
    descriptionEn?: string | null;
    descriptionFr?: string | null;
    durationWeeks?: number | null;
  };
  cohorts?: Array<{
    name?: string;
    startDate?: string;
    endDate?: string;
    remainingPlaces?: number;
    isFull?: boolean;
    isFree?: boolean;
    listPriceXaf?: number;
    priceXaf?: number;
    promotionActive?: boolean;
    promotionEndsAt?: string | null;
  }>;
  registrationUrl?: string;
  siteUrl?: string;
};

let salesInfoCache: { expiresAt: number; value: AcademySalesInfo | null } | null = null;

async function getAcademySalesInfo(): Promise<AcademySalesInfo | null> {
  if (salesInfoCache && salesInfoCache.expiresAt > Date.now()) return salesInfoCache.value;
  try {
    const response = await fetch(SALES_INFO_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(3500)
    });
    if (!response.ok) throw new Error("Academy sales-info returned HTTP " + response.status);
    const info = await response.json() as AcademySalesInfo;
    if (info?.ok !== true || typeof info.available !== "boolean") {
      throw new Error("Academy sales-info returned an unexpected response");
    }
    salesInfoCache = { value: info, expiresAt: Date.now() + (info.available ? 5 * 60_000 : 60_000) };
    return info;
  } catch (error: any) {
    console.error("[sales-agent] Academy sales-info API unavailable", {
      message: String(error?.message ?? error).slice(0, 180)
    });
    salesInfoCache = { value: null, expiresAt: Date.now() + 30_000 };
    return null;
  }
}

function buildAcademyContext(info: AcademySalesInfo | null) {
  const lines = [
    "Live Academy information is fetched from the official public sales-info API.",
    "Official site: " + SITE_URL,
    "Official registration URL: " + REGISTRATION_URL
  ];
  if (!info) {
    lines.push("The live Academy API is temporarily unreachable. Do not state exact prices, discounts, deadlines, capacity, or availability. Direct the prospect to the official registration page for current details.");
    return lines.join("\\n");
  }
  if (!info.available || !info.course) {
    lines.push("The official API reports that no published course is currently available. Do not imply that registration is open; direct the person to the official website for updates.");
    return lines.join("\\n");
  }

  lines.push("Course (English): " + (info.course.titleEn || "Kingdom AI Academy practical AI training"));
  if (info.course.titleFr) lines.push("Course (French): " + info.course.titleFr);
  if (info.course.descriptionEn) lines.push("Description (English): " + info.course.descriptionEn);
  if (info.course.descriptionFr) lines.push("Description (French): " + info.course.descriptionFr);
  if (typeof info.course.durationWeeks === "number") lines.push("Duration: " + info.course.durationWeeks + " weeks");

  const cohorts = Array.isArray(info.cohorts) ? info.cohorts : [];
  if (!cohorts.length) {
    lines.push("No currently eligible cohort was returned by the official API. Do not invent cohort dates, remaining places, or availability.");
  } else {
    lines.push("Current cohort/pricing facts from the official API:");
    for (const cohort of cohorts.slice(0, 5)) {
      const facts = [
        cohort.name || "Available cohort",
        cohort.startDate ? "starts " + cohort.startDate : "",
        cohort.endDate ? "ends " + cohort.endDate : "",
        cohort.isFull ? "full" : (typeof cohort.remainingPlaces === "number" ? cohort.remainingPlaces + " places remaining" : ""),
        cohort.isFree ? "tuition is currently free" : (typeof cohort.priceXaf === "number" ? "current fee " + Math.round(cohort.priceXaf).toLocaleString("en-US") + " XAF" : ""),
        typeof cohort.listPriceXaf === "number" && typeof cohort.priceXaf === "number" && cohort.listPriceXaf > cohort.priceXaf
          ? "listed price " + Math.round(cohort.listPriceXaf).toLocaleString("en-US") + " XAF" : "",
        cohort.promotionActive && cohort.promotionEndsAt ? "promotion ends " + cohort.promotionEndsAt : ""
      ].filter(Boolean);
      lines.push("- " + facts.join("; "));
    }
  }
  lines.push("Treat these API facts as the current source of truth. Never claim that a person has registered or paid; this API does not report individual transaction status.");
  return lines.join("\\n");
}

const SYSTEM = `You are the independent WhatsApp AI SALES ASSISTANT for Kingdom AI Academy. Your job is to guide prospects through a helpful, adaptive sales conversation and help interested people make an informed purchase decision. You are NOT a student-support agent, tutor, course dashboard, enrollment manager, or component embedded in the Academy platform. WhatsApp is the sales funnel; the Academy website is the separate destination for registration and payment.

LANGUAGE AND CONVERSATION
- Reply in the language the prospect uses, English or French. Switch immediately if asked.
- Be warm, respectful, natural, concise and conversational. Never sound like a questionnaire or a scripted robot.
- Ask at most ONE useful discovery question in a message. Remember previous answers and never ask the same thing twice.
- Answer direct questions before asking another question.
- Do not mention internal systems, APIs, databases, or technical implementation.

SALES GOAL AND FUNNEL
Move naturally through: WELCOME → DISCOVER → QUALIFY → MATCH THE OFFER → HANDLE OBJECTIONS → INVITE TO REGISTER → CONFIRM NEXT STEP.
Do not force every stage. If the person is already ready to register, give the link immediately. If they ask a direct question, answer it rather than delaying with discovery.

1. WELCOME: greet politely and identify yourself as Kingdom AI Academy's virtual sales assistant. Ask what brought the person to the Academy or what they would like to achieve with AI.
2. DISCOVER: understand the person's goal, experience level, context/role and most important challenge. Relevant goals can include AI basics, church communication, digital evangelism, sermons and Bible-study preparation, content creation, flyers/videos, administration or general professional productivity.
3. QUALIFY: find out what matters most to them and, only when relevant, what concern could prevent them from starting: cost, time, confidence, internet access, trust or uncertainty about the course.
4. MATCH: explain only the course benefits that match what the prospect told you. The Academy offers practical learning in AI fundamentals and digital tools. Do not promise that every tool is free, every lesson is available in both languages, or that the course guarantees a job, income, ministry growth or any other outcome.
5. HANDLE OBJECTIONS: respond to the specific concern with empathy and useful information. For price concerns, acknowledge the budget, explain that the current fee and any offer are shown on the official registration page, and never pressure the person to borrow or use essential funds. For “I need to think,” ask what information would help only if appropriate. For “I need to ask someone,” offer a short summary they can share. For “YouTube is free,” acknowledge its value and explain that structured learning may help someone who wants a guided path. For fear of AI or lack of experience, reassure them that they can begin step by step without pretending the learning requires no effort.
6. CLOSE: when interest is clear, make one clear invitation to continue registration. Use this link: https://kingdom-ai-academy.vercel.app/auth/register?utm_source=whatsapp&utm_medium=chat&utm_campaign=academy_admissions. Explain that the official page shows the current course details, fee, any available offer and payment instructions. Never request payment directly in chat, and never invent a discount, deadline, seat count, payment method or price.
7. IF THEY HESITATE: do not repeat the same pitch. Choose the next response based on the actual objection: clarify value, answer a question, give a concise summary, offer the registration link without pressure, or ask permission to reconnect later if follow-up is available. Respect a clear “no” or opt-out immediately.

TRUST AND ACCURACY
- Do not invent prices, promotions, deadlines, scarcity, accreditation, certificates, testimonials, features, payment success or enrollment status. The official registration page is the source for current prices and payment instructions.
- Never claim to see whether a prospect clicked, registered or paid unless a verified system explicitly provides that information.
- Never ask for passwords, mobile-money PINs, OTPs or other secret security codes.
- AI can help brainstorm and organize ministry or work content, but people must verify facts, biblical interpretation, doctrine and important decisions themselves.
- If asked about an unknown detail, be transparent and direct the person to the official Academy website or team rather than guessing.

BOUNDARIES
- This is a sales funnel, not student support. If an existing student asks for lessons, account access, course progress or technical help, briefly direct them to the official Academy website/team; do not attempt to act as their tutor or manage enrollment.
- Do not use guilt, religious authority, fear, fabricated urgency or coercion.
- Respect privacy. Use only information relevant to the conversation.
- Respect STOP and equivalent opt-out requests. The webhook handles opt-out processing.

FINAL PRIORITY
Make the prospect feel understood, show relevant value, address the real barrier and help them choose their next step. A sale is the goal, but trust and truthful information are mandatory. `;

function testModeReply(history: HistoryMessage[]) {
  const latest = [...history].reverse().find(m => m.role === "user")?.content?.trim() ?? "";
  const text = latest.toLowerCase();
  const french = /bonjour|bonsoir|prix|combien|co[uû]t|inscri|formation|cours|paiement|promotion|fran[cç]ais|je veux|je suis/.test(text);
  const link = REGISTRATION_URL;

  if (/prix|combien|co[uû]t|price|how much|fee|tuition|promotion|promo|discount|r[eé]duction/.test(text)) {
    return french
      ? `Le tarif et les éventuelles offres en cours sont indiqués sur la page officielle d’inscription : ${link}. Pour mieux vous orienter, qu’aimeriez-vous surtout apprendre ou accomplir avec l’IA ?`
      : `The current fee and any available offer are shown on the official registration page: ${link}. To help you decide, what would you most like to learn or achieve with AI?`;
  }
  if (/inscri|register|enroll|enrol|paiement|payment|pay|link|lien/.test(text)) {
    return french
      ? `Bien sûr. Voici la page officielle pour consulter les détails et vous inscrire : ${link}. Souhaitez-vous que je vous aide à comprendre le contenu de la formation avant de commencer ?`
      : `Of course. Here is the official page to review the details and register: ${link}. Would you like help understanding the course before you begin?`;
  }
  if (/trop cher|expensive|can't afford|cannot afford|pas les moyens|budget/.test(text)) {
    return french
      ? "Je comprends, le budget compte. Je ne veux pas vous pousser à dépenser de l’argent essentiel. Le tarif et les offres éventuelles sont affichés sur la page officielle. Qu’est-ce qui vous intéresse le plus dans cette formation ?"
      : "I understand—budget matters. I would not want you to spend money needed for essentials. The official page shows the current fee and any available offer. What interests you most about the training?";
  }
  return french
    ? `Bonjour 👋 Bienvenue à Kingdom AI Academy. Je peux vous aider à voir si notre formation pratique en IA correspond à vos objectifs. Qu’aimeriez-vous surtout accomplir avec l’IA ? Si vous êtes déjà prêt(e), les détails sont ici : ${link}`
    : `Hello 👋 Welcome to Kingdom AI Academy. I can help you see whether our practical AI training fits your goals. What would you most like to accomplish with AI? If you are ready, the details are here: ${link}`;
}

export async function generateSalesReply(history: HistoryMessage[], activeProduct?: string | null) {
  // Deterministic replies are reserved for explicit test mode. Normal operation uses the adaptive AI sales funnel.
  if (process.env.SALES_AI_MODE === "test") {
    return testModeReply(history);
  }

  const academyInfo = await getAcademySalesInfo();
  const context = "Active product: Kingdom AI Academy practical AI training. This assistant is the WhatsApp sales funnel and the Academy website is the source of truth for current course, cohort, price, promotion, and capacity information.\n" + buildAcademyContext(academyInfo);
  try {
    const result = await generateWithFreeRouter(SYSTEM + "\n" + context, history);
    return result.text;
  } catch (error) {
    console.error("[sales-agent] AI generation failed; using safe fallback reply", error);
    return testModeReply(history);
  }
}
