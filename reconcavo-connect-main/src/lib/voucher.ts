// Voucher code & password generators (no ambiguous chars)
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0,O,1,I,L
const PASS_CHARS = "abcdefghjkmnpqrstuvwxyz23456789"; // simple lowercase + digits, no 0,o,1,i,l

// RNG criptográfico (crypto.getRandomValues) com rejection sampling para evitar
// viés de módulo — funciona tanto no browser quanto no runtime Deno das Edge
// Functions. Substitui Math.random(), que é previsível e não deve proteger um
// código que dá acesso pago.
function pick(chars: string, n: number) {
  const len = chars.length;
  const maxUnbiased = Math.floor(256 / len) * len; // maior múltiplo de len <= 256
  const buf = new Uint8Array(1);
  let out = "";
  while (out.length < n) {
    crypto.getRandomValues(buf);
    if (buf[0] < maxUnbiased) out += chars[buf[0] % len];
  }
  return out;
}

// Código de 6 caracteres no alfabeto sem ambíguos (32 chars) = 32^6 ≈ 1,07
// bilhão de combinações — dificulta adivinhação de um código válido.
export function generateVoucherCode(): string {
  return `REC-${pick(CODE_CHARS, 6)}`;
}

// Mantida por compatibilidade, mas NÃO é mais chamada no fluxo: o código único
// (`code`) preenche username e password. Ver docs/mudancas-projeto-lovable.md §4.
export function generatePassword(): string {
  return pick(PASS_CHARS, 6);
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours}h`;
  const days = hours / 24;
  return `${days}d`;
}

export function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: "Pendente",
    completed: "Pago",
    failed: "Cancelado",
    no_stock: "Sem estoque",
    available: "Disponível",
    gerado: "Gerado",
    disponivel: "Disponível",
    active: "Ativo",
    expired: "Expirado",
  };
  return map[s] ?? s;
}
