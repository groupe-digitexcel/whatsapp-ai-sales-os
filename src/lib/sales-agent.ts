import OpenAI from "openai";

type HistoryMessage = { role: "user" | "assistant"; content: string };

type Provider = {
  name: string;
  key?: string;
  baseURL: string;
  model: string;
};

function providers(): Provider[] {
  const list: Provider[] = [];
  if (process.env.GEMINI_API_KEY) list.push({
    name: "gemini",
    key: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash"
  });
  if (process.env.GROQ_API_KEY) list.push({
    name: "groq",
    key: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
    model: process.env.GROQ_MODEL || "openai/gpt-oss-20b"
  });
  if (process.env.OPENROUTER_API_KEY) list.push({
    name: "openrouter",
    key: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    model: process.env.OPENROUTER_MODEL || "openrouter/free"
  });
  return list;
}

export async function generateWithFreeRouter(
  system: string,
  history: HistoryMessage[]
): Promise<{ text: string; provider: string }> {
  const list = providers();
  if (!list.length) throw new Error("No AI provider configured");

  let lastError = "No provider succeeded";
  for (const p of list) {
    try {
      const client = new OpenAI({ apiKey: p.key, baseURL: p.baseURL });
      const result = await client.chat.completions.create({
        model: p.model,
        messages: [{ role: "system", content: system }, ...history.slice(-20)],
        temperature: 0.4,
        max_tokens: 350
      });
      const text = result.choices[0]?.message?.content?.trim();
      if (text) return { text, provider: p.name };
      lastError = p.name + ": empty response";
    } catch (error: any) {
      lastError = p.name + ": " + String(error?.message ?? error);
    }
  }
  throw new Error(lastError);
}

const SYSTEM = `You are the official WhatsApp AI Sales Assistant.
PRIMARY GOAL: help a genuinely interested customer confidently purchase the product they came for.
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

function testModeReply(history: {role:"user"|"assistant",content:string}[], activeProduct?: string|null) {
  const latest = [...history].reverse().find(m => m.role === "user")?.content?.trim() ?? "";
  const text = latest.toLowerCase();

  if (activeProduct === "bookscanpro" || text.includes("bookscanpro") || text.includes("scanner") || text.includes("ocr")) {
    return "BookScanPro is 2,000 FCFA. It lets you scan documents, use OCR, create PDF/Word files, and use AI assistance and translation.\n\nPurchase: https://digitexcel5g.mychariow.shop/prd_29c6ihy5";
  }
  if (activeProduct === "umm" || text.includes("umm") || text.includes("ultimate money") || text.includes("affiliate")) {
    return "DigitStem UMM is a one-year training focused on AI, affiliate marketing and WhatsApp/Facebook marketing strategies. The confirmed price is 7,250 FCFA / 14,500 NGN.\n\nPurchase: https://digitstem.com/yjF";
  }
  if (activeProduct === "tiktok_affiliate_pro" || text.includes("tiktok")) {
    return "TikTok Affiliate Pro is a practical TikTok Affiliate Marketing course.\n\nPurchase: https://digitexcel5g.mychariow.shop/prd_zr2x3nim";
  }
  return "Hello 👋 Welcome. I can help you with the product you came from. Which product are you interested in: BookScanPro, DigitStem UMM, or TikTok Affiliate Pro?";
}

export async function generateSalesReply(history: {role:"user"|"assistant",content:string}[], activeProduct?: string|null) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;

  // Test mode remains available without any paid AI provider.
  if (process.env.SALES_AI_MODE !== "live") {
    return testModeReply(history, activeProduct);
  }

  // OpenRouter is OpenAI-SDK compatible. Prefer it when configured, while
  // retaining direct OpenAI support as a fallback for later production use.
  const useOpenRouter = Boolean(openRouterKey);
  const apiKey = openRouterKey || openAIKey;
  if (!apiKey) throw new Error("No AI API key configured");

  const client = new OpenAI({
    apiKey,
    ...(useOpenRouter ? { baseURL: "https://openrouter.ai/api/v1" } : {})
  });
  const model = useOpenRouter
    ? (process.env.OPENROUTER_MODEL || "openrouter/free")
    : (process.env.OPENAI_MODEL || "gpt-5-mini");
  const context = activeProduct ? `Active product: ${activeProduct}` : "No active product yet.";
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {role:"system", content: SYSTEM + "\n" + context},
      ...history.slice(-20)
    ],
    temperature: 0.4,
    max_tokens: 350
  });
  return completion.choices[0]?.message?.content?.trim() || "Thanks for your message. How can I help you with the product you're interested in?";
}
export async function generateSalesReply(history: {role:"user"|"assistant",content:string}[], activeProduct?: string|null) {
  const testModeReply = (history: {role:"user"|"assistant",content:string}[], activeProduct?: string|null) => {
    const latest = [...history].reverse().find(m => m.role === "user")?.content?.trim() ?? "";
    const text = latest.toLowerCase();
    if (activeProduct === "bookscanpro" || text.includes("bookscanpro") || text.includes("scanner") || text.includes("ocr"))
      return "BookScanPro is 2,000 FCFA. It lets you scan documents, use OCR, create PDF/Word files, and use AI assistance and translation.\n\nPurchase: https://digitexcel5g.mychariow.shop/prd_29c6ihy5";
    if (activeProduct === "umm" || text.includes("umm") || text.includes("ultimate money") || text.includes("affiliate"))
      return "DigitStem UMM is a one-year training focused on AI, affiliate marketing and WhatsApp/Facebook marketing strategies. The confirmed price is 7,250 FCFA / 14,500 NGN.\n\nPurchase: https://digitstem.com/yjF";
    if (activeProduct === "tiktok_affiliate_pro" || text.includes("tiktok"))
      return "TikTok Affiliate Pro is a practical TikTok Affiliate Marketing course.\n\nPurchase: https://digitexcel5g.mychariow.shop/prd_zr2x3nim";
    return "Hello 👋 Welcome. I can help you with the product you came from. Which product are you interested in: BookScanPro, DigitStem UMM, or TikTok Affiliate Pro?";
  };

  if (process.env.SALES_AI_MODE !== "live") return testModeReply(history, activeProduct);

  const context = activeProduct ? `Active product: ${activeProduct}` : "No active product yet.";
  const result = await generateWithFreeRouter(SYSTEM + "\n" + context, history);
  return result.text;
}
