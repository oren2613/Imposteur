/**
 * Client minimal pour l'API Groq (compatible OpenAI Chat Completions).
 * Gratuit, rapide — utilisé pour piloter les joueurs IA.
 * Clé attendue dans la variable d'environnement GROQ_API_KEY.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** True si une clé API Groq est configurée. */
export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

/**
 * Appelle l'API Groq et retourne le texte de la réponse, ou null en cas d'échec
 * (pas de clé, timeout, erreur réseau/HTTP). L'appelant doit prévoir un repli.
 */
export async function groqChat(
  messages: ChatMessage[],
  opts: GroqChatOptions = {}
): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 80,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
