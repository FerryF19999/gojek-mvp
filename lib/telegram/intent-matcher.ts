/**
 * Intent Matcher — Keyword-based intent detection
 * Typo-tolerant, supports Bahasa Indonesia casual variants
 */

export type Intent =
  | "DAFTAR"
  | "GO_ONLINE"
  | "GO_OFFLINE"
  | "TERIMA"
  | "TOLAK"
  | "TIBA"
  | "JEMPUT"
  | "SELESAI"
  | "PENGHASILAN"
  | "BANTUAN"
  | "TARIK"
  | "KONFIRMASI"
  | "TIDAK_DIKENAL";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function matchAny(text: string, keywords: string[]): boolean {
  for (const kw of keywords) {
    if (text === kw) return true;
    if (text.startsWith(kw + " ")) return true;
    const regex = new RegExp(`(?:^|\\s|\\b)${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$|\\b)`);
    if (regex.test(text)) return true;
  }
  return false;
}

export function matchIntent(rawText: string): Intent {
  const t = normalize(rawText);

  if (matchAny(t, ["daftar", "gabung", "mau ikut", "mau daftar", "join", "register"]))
    return "DAFTAR";

  if (matchAny(t, ["mulai", "online", "siap", "start", "mau narik", "narik"]))
    return "GO_ONLINE";

  if (matchAny(t, ["stop", "offline", "istirahat", "brenti", "berhenti", "selesai narik", "off"]))
    return "GO_OFFLINE";

  if (matchAny(t, ["terima", "ya", "yes", "ok", "oke", "gas", "mau", "boleh", "ayok", "ayo", "yoi", "yok", "ambil"]))
    return "TERIMA";

  if (matchAny(t, ["tolak", "gak", "skip", "no", "nope", "lewat", "gk", "ngga", "nggak", "engga", "enggak", "tidak", "ogah", "males"]))
    return "TOLAK";

  if (matchAny(t, [
    "sampe", "sampai", "nyampe", "udh sampe", "udah sampe", "udah nyampe",
    "sdh sampe", "sudah sampai", "arrived", "tiba", "udh nyampe",
    "dah sampe", "dah nyampe", "uda sampe", "uda nyampe",
  ]))
    return "TIBA";

  if (matchAny(t, ["jalan", "pickup", "berangkat", "naik", "udah naik", "sdh naik", "penumpang naik", "cabut"]))
    return "JEMPUT";

  if (matchAny(t, ["done", "selesai", "kelar", "beres", "udah", "finish", "complete", "nyampe tujuan", "sampe tujuan"]))
    return "SELESAI";

  if (matchAny(t, ["gaji", "penghasilan", "duit", "earning", "saldo", "uang", "pendapatan", "income", "cek gaji"]))
    return "PENGHASILAN";

  if (matchAny(t, ["help", "bantuan", "gimana", "cara", "tolong", "bingung", "gmn", "caranya", "bantuin"]))
    return "BANTUAN";

  if (matchAny(t, ["tarik", "withdraw", "cairkan", "cair", "ambil saldo", "transfer saldo"]))
    return "TARIK";

  if (matchAny(t, ["oke", "konfirmasi", "confirm", "bener", "betul", "setuju"]))
    return "KONFIRMASI";

  return "TIDAK_DIKENAL";
}

export function isRegistrationInput(text: string): boolean {
  const intent = matchIntent(text);
  return intent === "TIDAK_DIKENAL" || intent === "KONFIRMASI";
}

export function extractVehicleType(text: string): "motor" | "car" | null {
  const t = normalize(text);
  if (matchAny(t, ["motor", "mtor", "motr", "sepeda motor", "roda 2", "roda dua"])) return "motor";
  if (matchAny(t, ["mobil", "car", "roda 4", "roda empat"])) return "car";
  return null;
}

export function extractPaymentMethod(text: string): { method: string; display: string } | null {
  const t = normalize(text);
  if (matchAny(t, ["1", "ovo"])) return { method: "ovo", display: "OVO" };
  if (matchAny(t, ["2", "gopay"])) return { method: "gopay", display: "GoPay" };
  if (matchAny(t, ["3", "dana"])) return { method: "dana", display: "Dana" };
  if (matchAny(t, ["4", "bank", "transfer"])) return { method: "bank_transfer", display: "Transfer Bank" };
  return null;
}
