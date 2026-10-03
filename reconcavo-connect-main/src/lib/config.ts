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

// Link de conexão que TROCA o trial pelo voucher num toque. O código vai no
// HASH (#) e não na query (?): o MikroTik reprocessa tudo depois do "?" e
// descarta parâmetros próprios, mas o "#" fica só no navegador e sobrevive.
// Vamos DIRETO pro /logout (não pelo /status): o mini-navegador de portal
// cativo bloqueia o localStorage entre páginas, então não dá pra "guardar" o
// código — ele tem que viajar no próprio #. O /logout derruba o trial e cai na
// login.html JÁ com o #rvconnect na URL (o fragment sobrevive ao redirect do
// logout), e a login.html lê e conecta. Sem sessão, /logout só mostra o portal,
// que também recebe o # e conecta. Nos dois casos, 1 toque, sem storage.
// `dst` (opcional) vai junto no # e vira o destino PÓS-login: passamos a URL do
// próprio pedido, pra que o cliente volte pra tela do pedido (já conectado e com
// "Pagamento confirmado") em vez de cair na página de status do MikroTik.
export function buildConnectUrl(code: string, gateway?: string, dst?: string): string {
  const frag = new URLSearchParams({ rvconnect: code });
  if (dst) frag.set("dst", dst);
  return `http://${gateway || GATEWAY_IP}/logout#${frag.toString()}`;
}
