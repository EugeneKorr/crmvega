import type { LLMConfig, RawMessage } from "./types.ts";

const SYSTEM = `Ты — аналитик клиентской базы валютного обменника Vega.
Перед тобой ВСЯ история переписки клиента со всеми сделками хронологически.
Составь портрет клиента строго на основе того, что написано.
Не выдумывай факты которых нет в тексте.
Сотрудников не оценивай — эти сделки давно закрыты.
Сотрудников которые встречаются с клиентами и развозят наличные называй ТОЛЬКО менеджерами, никогда не называй их курьерами.`;

const FORMAT = `---
Выведи строго в плоском формате (без markdown, без заголовков):

personal_facts:
- [личные детали: семья, питомцы, здоровье, работа, события — только если явно упомянуто]

behavior_flags:
- [характер общения, тон, поведенческие паттерны]

preferences:
- [банки, способы получения, города, время встреч, суммы]

red_flags:
- [агрессия, угрозы, манипуляции, подозрительные паттерны — пусто если нет]

content_signals:
- [темы интереса, вопросы которые задавал клиент]`;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateMessages(
  messages: RawMessage[],
  maxTokens: number,
): RawMessage[] {
  const firstBudget = Math.floor(maxTokens * 0.2);
  const lastBudget = maxTokens - firstBudget;

  const first: RawMessage[] = [];
  let firstUsed = 0;
  for (const msg of messages) {
    const t = estimateTokens(msg.content);
    if (firstUsed + t > firstBudget) break;
    first.push(msg);
    firstUsed += t;
  }

  const last: RawMessage[] = [];
  let lastUsed = 0;
  for (let i = messages.length - 1; i >= first.length; i--) {
    const t = estimateTokens(messages[i].content);
    if (lastUsed + t > lastBudget) break;
    last.unshift(messages[i]);
    lastUsed += t;
  }

  return [...first, ...last];
}

export function buildPrompt(messages: RawMessage[]): string {
  const conversation = messages
    .map((m) => `[${m.author_type}]: ${m.content}`)
    .join("\n");
  return `${SYSTEM}\n\n[ПЕРЕПИСКА КЛИЕНТА — хронологически]\n${conversation}\n\n${FORMAT}`;
}

const FALLBACK_MODEL = "mistralai/mistral-large-2512";

const FETCH_TIMEOUT_MS = 90_000;

async function callModel(
  prompt: string,
  config: LLMConfig,
  model: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const delay = 1_000 * Math.pow(2, attempt);
      console.warn(`    LLM [${model}] retry ${attempt}/2, ждём ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(`${config.url}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2048,
          temperature: 0.1,
          // Отключаем thinking-mode для Qwen3.x (иначе все токены уходят на reasoning)
          thinking: { type: "disabled" },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 429 || res.status >= 500) {
        console.warn(`    LLM [${model}] HTTP ${res.status}, retry...`);
        continue;
      }

      if (!res.ok) {
        throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
      }

      const json = await res.json();
      const text: string | null = json.choices?.[0]?.message?.content ?? null;
      if (!text) {
        console.warn(`    LLM [${model}] content=null (thinking leak), retry ${attempt + 1}/3`);
        continue;
      }
      return text;
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const isAbort = e instanceof Error && e.name === "AbortError";
      console.warn(`    LLM [${model}] ${isAbort ? `timeout ${FETCH_TIMEOUT_MS}ms` : `fetch error: ${e}`}, retry ${attempt + 1}/3`);
      continue;
    }
  }
  return null;
}

export async function callLLM(
  prompt: string,
  config: LLMConfig,
): Promise<string> {
  // Попытка с основной моделью
  const result = await callModel(prompt, config, config.model);
  if (result) return result;

  // Fallback: qwen-2.5-72b надёжно работает без thinking leak
  if (config.model !== FALLBACK_MODEL) {
    console.warn(`    Переключаемся на fallback: ${FALLBACK_MODEL}`);
    const fallback = await callModel(prompt, config, FALLBACK_MODEL);
    if (fallback) return fallback;
  }

  throw new Error(`LLM: все попытки не удались (основная: ${config.model}, fallback: ${FALLBACK_MODEL})`);
}
