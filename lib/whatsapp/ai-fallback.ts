/**
 * AI Fallback — MiniMax M2 integration for unrecognized messages
 * Only called for ~10% of messages that keyword matching can't handle
 */

import { DriverWhatsappState } from "./state-machine";

const MINIMAX_API_URL = "https://api.minimaxi.chat/v1/text/chatcompletion_v2";

interface AIResponse {
  reply: string;
  suggestedAction?: string;
}

function buildSystemPrompt(state: DriverWhatsappState): string {
  const stateDescriptions: Record<string, string> = {
    unknown: "belum terdaftar",
    registering: "sedang mendaftar",
    idle: "offline, belum mulai narik",
    online: "online, menunggu order",
    offered: `ditawarin order ${state.currentRideCode || ""}`,
    picking_up: `menuju lokasi jemput untuk order ${state.currentRideCode || ""}`,
    at_pickup: `di lokasi jemput untuk order ${state.currentRideCode || ""}`,
    on_ride: `sedang mengantar penumpang untuk order ${state.currentRideCode || ""}`,
  };

  const currentState = stateDescriptions[state.state] || state.state;

  const availableActions: Record<string, string[]> = {
    unknown: ["DAFTAR"],
    registering: ["lanjutkan pendaftaran"],
    idle: ["MULAI", "GAJI", "TARIK", "HELP"],
    online: ["STOP", "GAJI", "HELP"],
    offered: ["YA (terima)", "GAK (tolak)"],
    picking_up: ["SAMPE (tiba di lokasi)", "HELP"],
    at_pickup: ["JALAN (mulai antar)", "HELP"],
    on_ride: ["DONE (selesai)", "HELP"],
  };

  const actions = availableActions[state.state]?.join(", ") || "HELP";

  return `Kamu adalah asisten NEMU Ojek yang ramah dan membantu.
Status driver saat ini: ${currentState}.
Perintah yang tersedia: ${actions}.

Aturan:
- Balas pakai Bahasa Indonesia santai dan ramah
- Jawaban singkat, max 2-3 kalimat
- Kalau driver bingung, arahkan ke perintah yang tepat
- Jangan pernah minta driver download app atau buka website (kecuali link GPS)
- Kalau ada masalah di perjalanan, coba bantu selesaikan
- Pakai emoji secukupnya`;
}

export async function getAIFallback(
  message: string,
  state: DriverWhatsappState,
): Promise<AIResponse> {
  const apiKey = process.env.MINIMAX_API_KEY;

  // If no API key configured, return generic help
  if (!apiKey) {
    console.warn("[AI Fallback] MINIMAX_API_KEY not configured, using generic reply");
    return {
      reply: `Hmm, aku kurang ngerti nih 🤔\nKetik HELP buat liat daftar perintah ya!`,
    };
  }

  try {
    const systemPrompt = buildSystemPrompt(state);

    const response = await fetch(MINIMAX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "MiniMax-Text-01",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error(`[AI Fallback] MiniMax API error: ${response.status}`);
      return { reply: `Maaf, aku gak bisa jawab itu sekarang 😅\nKetik HELP buat bantuan.` };
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return { reply: `Hmm, aku kurang ngerti nih 🤔\nKetik HELP buat liat daftar perintah ya!` };
    }

    return { reply };
  } catch (error) {
    console.error("[AI Fallback] Error:", error);
    return { reply: `Maaf, ada gangguan nih 😅\nKetik HELP buat bantuan.` };
  }
}
