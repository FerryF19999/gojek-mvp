/**
 * Telegram Bot API wrapper
 * Handles sendMessage, setWebhook, and other Telegram API calls
 */

const TELEGRAM_API = "https://api.telegram.org/bot";

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  return token;
}

function apiUrl(method: string): string {
  return `${TELEGRAM_API}${getToken()}/${method}`;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string; first_name?: string; last_name?: string; username?: string };
  date: number;
  text?: string;
  photo?: Array<{ file_id: string; width: number; height: number }>;
  location?: { latitude: number; longitude: number };
  contact?: { phone_number: string; first_name: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
  };
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  options?: {
    parseMode?: "HTML" | "MarkdownV2";
    replyMarkup?: any;
  },
): Promise<any> {
  const body: Record<string, any> = {
    chat_id: chatId,
    text,
  };

  if (options?.parseMode) body.parse_mode = options.parseMode;
  if (options?.replyMarkup) body.reply_markup = JSON.stringify(options.replyMarkup);

  const res = await fetch(apiUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[TelegramBot] sendMessage failed:", err);
    throw new Error(`Telegram API error: ${res.status}`);
  }

  return res.json();
}

export async function sendMessageWithButtons(
  chatId: number | string,
  text: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>,
): Promise<any> {
  return sendMessage(chatId, text, {
    replyMarkup: { inline_keyboard: buttons },
  });
}

/**
 * Send message with a custom reply keyboard (e.g., "Share Location" button)
 * request_location and request_contact only work with reply keyboards
 */
export async function sendMessageWithKeyboard(
  chatId: number | string,
  text: string,
  keyboard: Array<Array<{ text: string; request_location?: boolean; request_contact?: boolean }>>,
  options?: { oneTime?: boolean; resize?: boolean },
): Promise<any> {
  return sendMessage(chatId, text, {
    replyMarkup: {
      keyboard,
      one_time_keyboard: options?.oneTime ?? true,
      resize_keyboard: options?.resize ?? true,
    },
  });
}

/**
 * Remove reply keyboard
 */
export async function sendMessageRemoveKeyboard(
  chatId: number | string,
  text: string,
): Promise<any> {
  return sendMessage(chatId, text, {
    replyMarkup: { remove_keyboard: true },
  });
}

/**
 * Set bot commands menu (shows in Telegram UI "/" menu)
 */
export async function setBotCommands(commands: Array<{ command: string; description: string }>): Promise<any> {
  const res = await fetch(apiUrl("setMyCommands"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  });
  return res.json();
}

/**
 * Set bot description (shown on bot's profile)
 */
export async function setBotDescription(description: string): Promise<any> {
  const res = await fetch(apiUrl("setMyDescription"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  return res.json();
}

/**
 * Set short description (shown in bot profile header)
 */
export async function setBotShortDescription(shortDescription: string): Promise<any> {
  const res = await fetch(apiUrl("setMyShortDescription"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ short_description: shortDescription }),
  });
  return res.json();
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<any> {
  const body: Record<string, any> = { callback_query_id: callbackQueryId };
  if (text) body.text = text;

  const res = await fetch(apiUrl("answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return res.json();
}

export async function setWebhook(url: string, secretToken?: string): Promise<any> {
  const body: Record<string, any> = {
    url,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  };

  if (secretToken) body.secret_token = secretToken;

  const res = await fetch(apiUrl("setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`setWebhook failed: ${err}`);
  }

  return res.json();
}

export async function deleteWebhook(): Promise<any> {
  const res = await fetch(apiUrl("deleteWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: true }),
  });
  return res.json();
}

export async function getMe(): Promise<TelegramUser> {
  const res = await fetch(apiUrl("getMe"));
  const data = await res.json();
  return data.result;
}
