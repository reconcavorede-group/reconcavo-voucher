// Configuração de ambiente do frontend. Nenhum segredo aqui — apenas a chave
// PÚBLICA do Mercado Pago (usada pelo SDK do Payment Brick) e os parâmetros do
// link de acesso "um clique" ao hotspot.
export const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY ?? "";

// IP fixo do gateway MikroTik na rede local e destino padrão após o login.
// Ajuste conforme a instalação (ver Settings / README).
export const GATEWAY_IP = import.meta.env.VITE_GATEWAY_IP ?? "172.16.0.1";
export const LOGIN_DST = import.meta.env.VITE_LOGIN_DST ?? "https://www.google.com";

// Monta o link de login por GET do hotspot MikroTik (requer login-by=http-pap).
// A credencial vai exposta na URL — limitação conhecida e aceita.
// `gateway` vem do LOCAL do voucher (multi-local); se ausente, usa o IP padrão
// do .env (compatível com instalação de local único).
export function buildLoginUrl(code: string, gateway?: string): string {
  const q = new URLSearchParams({ username: code, password: code, dst: LOGIN_DST });
  return `http://${gateway || GATEWAY_IP}/login?${q.toString()}`;
}
