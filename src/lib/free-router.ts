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
