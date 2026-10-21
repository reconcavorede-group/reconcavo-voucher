// Telefone internacional (E.164). Guardamos "+<DDI><número>" (ex.: +5575999999999).
// Brasil é o padrão. Lista curada dos países mais prováveis (turistas/estrangeiros).

export interface Country { code: string; flag: string; name: string }

export const COUNTRIES: Country[] = [
  { code: "55", flag: "🇧🇷", name: "Brasil" },
  { code: "1", flag: "🇺🇸", name: "EUA / Canadá" },
  { code: "351", flag: "🇵🇹", name: "Portugal" },
  { code: "54", flag: "🇦🇷", name: "Argentina" },
  { code: "598", flag: "🇺🇾", name: "Uruguai" },
  { code: "595", flag: "🇵🇾", name: "Paraguai" },
  { code: "56", flag: "🇨🇱", name: "Chile" },
  { code: "591", flag: "🇧🇴", name: "Bolívia" },
  { code: "51", flag: "🇵🇪", name: "Peru" },
  { code: "57", flag: "🇨🇴", name: "Colômbia" },
  { code: "58", flag: "🇻🇪", name: "Venezuela" },
  { code: "52", flag: "🇲🇽", name: "México" },
  { code: "34", flag: "🇪🇸", name: "Espanha" },
  { code: "33", flag: "🇫🇷", name: "França" },
  { code: "44", flag: "🇬🇧", name: "Reino Unido" },
  { code: "49", flag: "🇩🇪", name: "Alemanha" },
  { code: "39", flag: "🇮🇹", name: "Itália" },
  { code: "31", flag: "🇳🇱", name: "Holanda" },
  { code: "41", flag: "🇨🇭", name: "Suíça" },
  { code: "61", flag: "🇦🇺", name: "Austrália" },
  { code: "81", flag: "🇯🇵", name: "Japão" },
  { code: "86", flag: "🇨🇳", name: "China" },
  { code: "91", flag: "🇮🇳", name: "Índia" },
  { code: "972", flag: "🇮🇱", name: "Israel" },
  { code: "244", flag: "🇦🇴", name: "Angola" },
  { code: "238", flag: "🇨🇻", name: "Cabo Verde" },
  { code: "258", flag: "🇲🇿", name: "Moçambique" },
];

// Formata o número NACIONAL conforme o país. Brasil: (XX) XXXXX-XXXX; demais:
// agrupa os dígitos de forma leve (sem regra rígida, pois varia muito).
export function formatNational(code: string, value: string): string {
  const d = (value || "").replace(/\D/g, "");
  if (code === "55") {
    const n = d.slice(0, 11);
    if (n.length <= 2) return n;
    if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  }
  // genérico: grupos de 3-4
  return d.replace(/(\d{1,4})(?=(\d{3})+(?!\d))/g, "$1 ").trim().slice(0, 20);
}

// Monta o E.164 pra salvar. Vazio se não houver número.
export function buildE164(code: string, national: string): string {
  const d = (national || "").replace(/\D/g, "");
  return d ? `+${code}${d}` : "";
}

// Quebra um E.164 (ou número legado nacional BR) em país + nacional.
export function parseE164(value?: string | null): { code: string; national: string } {
  const raw = (value ?? "").trim();
  if (!raw) return { code: "55", national: "" };
  if (!raw.startsWith("+")) return { code: "55", national: raw.replace(/\D/g, "") }; // legado nacional BR
  const digits = raw.replace(/\D/g, "");
  const codes = COUNTRIES.map((c) => c.code).sort((a, b) => b.length - a.length);
  for (const c of codes) if (digits.startsWith(c)) return { code: c, national: digits.slice(c.length) };
  return { code: "55", national: digits.startsWith("55") ? digits.slice(2) : digits };
}

// Validação leve: Brasil exige 10-11 dígitos (DDD + número); demais, >= 6.
export function isValidPhone(code: string, national: string): boolean {
  const n = (national || "").replace(/\D/g, "").length;
  return code === "55" ? (n === 10 || n === 11) : n >= 6;
}

// Formata pra EXIBIÇÃO: Brasil -> (75) 99999-9999; internacional -> +<DDI> <num>.
// Aceita E.164 novo ("+55...") ou número legado nacional BR.
export function formatDisplay(phone?: string | null): string {
  const raw = (phone ?? "").trim();
  if (!raw) return "";
  const { code, national } = parseE164(raw);
  if (code === "55") return formatNational("55", national);
  return `+${code} ${formatNational(code, national)}`.trim();
}

// Dígitos p/ wa.me (com DDI). Aceita E.164 novo ou legado nacional BR.
export function waNumber(phone?: string | null): string {
  const raw = (phone ?? "").trim();
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (raw.startsWith("+")) return d;   // E.164 já tem DDI
  if (d.length >= 12) return d;        // provavelmente já com DDI
  return `55${d}`;                     // legado: nacional BR
}
