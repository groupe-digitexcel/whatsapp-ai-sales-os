import { PRODUCTS } from "./products";
import { generateWithFreeRouter } from "./free-router";

type HistoryMessage = { role: "user" | "assistant"; content: string };

const SYSTEM = `You are the official WhatsApp AI admissions assistant for Kingdom AI Academy. Answer in French or English and focus only on the Academy course.
PRIMARY GOAL: help a genuinely interested customer confidently purchase the product they came for.
ACADEMY SCOPE: This deployment is exclusively for Kingdom AI Academy. Never recommend or mention BookScanPro, UMM, TikTok Affiliate Pro, or unrelated products, even if they appear in old catalog data. The confirmed standard course fee is 60,000 FCFA. Never state a promotional price unless the Academy team confirms the current offer. Send registration questions to https://kingdom-ai-academy.vercel.app/. Reply in French or English to match the customer.
Rules:
- Answer the direct question first.
- Stay focused on the customer's active product; do not cross-sell during the initial conversation.
- Use short WhatsApp-style replies in English or French.
- Feature -> benefit -> practical result -> clear next step.
- If the customer says they lack funds, acknowledge it, explain relevant value, and ask when they realistically expect to be ready. Never pressure them to borrow money or use essential funds.
- If the customer asks whether the business is legitimate, calmly state only confirmed facts and encourage independent verification. Never invent registration evidence, guarantees, testimonials or approvals.
- Never invent product information, prices, discounts or results.
- If ready to buy, provide the direct product link.
- If clearly not interested, respect that.
ACTIVE PRODUCTS:
${JSON.stringify(PRODUCTS)}
`;

function testModeReply(history: HistoryMessage[], activeProduct?: string | null) {
  const latest = [...history].reverse().find(m => m.role === "user")?.content?.trim() ?? "";
  const text = latest.toLowerCase();
  // Academy-only mode: never route prospects to unrelated products.
  const french = /bonjour|prix|combien|co[uû]t|inscri|formation|cours|paiement|promotion|fran[cç]ais/.test(text);
  if (/promotion|promo|discount|r[eé]duction/.test(text)) {
    return french
      ? "Le tarif standard confirmé est de 60 000 FCFA. Toute promotion doit être confirmée par l'équipe. Consultez https://kingdom-ai-academy.vercel.app/"
      : "The confirmed standard fee is 60,000 FCFA. Please confirm any promotion with the Academy team: https://kingdom-ai-academy.vercel.app/";
  }
  if (/prix|combien|co[uû]t|price|how much|fee|tuition/.test(text)) {
    return french
      ? "Le tarif standard confirmé de la formation est de 60 000 FCFA. Informations d'inscription : https://kingdom-ai-academy.vercel.app/"
      : "The confirmed standard course fee is 60,000 FCFA. Registration information: https://kingdom-ai-academy.vercel.app/";
  }
  if (/inscri|register|enroll|enrol|paiement|payment|pay/.test(text)) {
    return french
      ? "Pour les étapes officielles d'inscription et de paiement, consultez https://kingdom-ai-academy.vercel.app/. Ne partagez jamais de mot de passe ni de code OTP."
      : "For official registration and payment steps, visit https://kingdom-ai-academy.vercel.app/. Never share a password or OTP.";
  }
  return french
    ? "Bonjour 👋 Bienvenue à Kingdom AI Academy ! Nous proposons une formation pratique bilingue sur les bases de l'IA et les outils numériques. Souhaitez-vous connaître le contenu, le tarif ou les étapes d'inscription ? https://kingdom-ai-academy.vercel.app/"
    : "Hello 👋 Welcome to Kingdom AI Academy! We offer practical bilingual training in AI fundamentals and digital tools. Would you like to know about the course, fee, or registration? https://kingdom-ai-academy.vercel.app/";

  if (activeProduct === "bookscanpro" || text.includes("bookscanpro") || text.includes("scanner") || text.includes("ocr"))
    return "BookScanPro is 2,000 FCFA. It lets you scan documents, use OCR, create PDF/Word files, and use AI assistance and translation.\n\nPurchase: https://digitexcel5g.mychariow.shop/prd_29c6ihy5";
  if (activeProduct === "umm" || text.includes("umm") || text.includes("ultimate money") || text.includes("affiliate"))
    return "DigitStem UMM is a one-year training focused on AI, affiliate marketing and WhatsApp/Facebook marketing strategies. The confirmed price is 7,250 FCFA / 14,500 NGN.\n\nPurchase: https://digitstem.com/yjF";
  if (activeProduct === "tiktok_affiliate_pro" || text.includes("tiktok"))
    return "TikTok Affiliate Pro is a practical TikTok Affiliate Marketing course.\n\nPurchase: https://digitexcel5g.mychariow.shop/prd_zr2x3nim";
  return "Hello 👋 Welcome. I can help you with the product you came from. Which product are you interested in: BookScanPro, DigitStem UMM, or TikTok Affiliate Pro?";
}

export async function generateSalesReply(history: HistoryMessage[], activeProduct?: string | null) {
  if (process.env.SALES_AI_MODE !== "live") {
    return testModeReply(history, activeProduct);
  }

  const context = activeProduct ? `Active product: ${activeProduct}` : "No active product yet.";
  const result = await generateWithFreeRouter(SYSTEM + "\n" + context, history);
  return result.text;
}
