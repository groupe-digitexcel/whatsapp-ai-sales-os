import OpenAI from "openai";
import { PRODUCTS } from "./products";

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

export async function generateSalesReply(history: {role:"user"|"assistant",content:string}[], activeProduct?: string|null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  const client = new OpenAI({apiKey});
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
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
