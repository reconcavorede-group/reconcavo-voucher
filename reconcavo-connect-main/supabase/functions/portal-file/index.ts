// Serve os arquivos do portal do hotspot (login/logout/status) pra os MikroTiks
// PUXAREM da nuvem (scheduler rv-portal), igual aos vouchers. Fonte de verdade
// aqui — atualizou aqui, todos os roteadores pegam na próxima rodada.
//   GET /portal-file?loja=<slug>&f=login|logout|status   -> text/html
// login é templatizado por ponto (slug/nome); logout/status são genéricos.
// Os $(...) são variáveis do MikroTik — saem literais, o roteador resolve.
// Deploy com --no-verify-jwt (conteúdo público, sem segredo).
import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/mercadopago.ts";

const BASE = "https://yzowyjaqwhjufdxiiujz.supabase.co/functions/v1/portal-file";

// .rsc do scheduler rv-portal (puxa login/logout/status pra pasta do hotspot).
// Usado pelo bootstrap remoto: o roteador baixa isto e dá /import.
const installRsc = (slug: string) => `/system scheduler remove [find where name="rv-portal"]
/system scheduler add name=rv-portal interval=1h start-time=startup on-event=":do {:local hd [/ip hotspot profile get [find name=\\"hsprof1\\"] html-directory]; :foreach ff in={\\"login\\";\\"logout\\";\\"status\\"} do={/tool fetch url=(\\"${BASE}?loja=${slug}&f=\\" . \\$ff) mode=https check-certificate=no dst-path=(\\$hd . \\"/\\" . \\$ff . \\".html\\")}} on-error={}"
:do {
  :local hd [/ip hotspot profile get [find name="hsprof1"] html-directory]
  :foreach ff in={"login";"logout";"status"} do={/tool fetch url=("${BASE}?loja=${slug}&f=" . $ff) mode=https check-certificate=no dst-path=($hd . "/" . $ff . ".html")}
} on-error={}
`;

const loginHtml = (slug: string, nome: string) => `<!-- login.html — Recôncavo Voucher (${nome}) — servido pela nuvem (portal-file). -->
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Recôncavo Voucher — ${nome}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;
           background:#0f3d2e; color:#fff; min-height:100vh;
           display:flex; align-items:center; justify-content:center; padding:16px; }
    .card { background:#fff; color:#0f172a; border-radius:16px; padding:24px; width:100%;
            max-width:360px; box-shadow:0 10px 40px rgba(0,0,0,.25); }
    .brand { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
    .brand .dot { width:40px; height:40px; display:flex; align-items:center; justify-content:center; }
    .brand .dot img { width:100%; height:100%; object-fit:contain; }
    h1 { font-size:18px; margin:0; }
    p.sub { color:#64748b; font-size:13px; margin:2px 0 0; }
    .buy { display:block; width:100%; text-align:center; text-decoration:none; background:#16a34a;
           color:#fff; font-weight:700; padding:14px; border-radius:12px; font-size:16px; border:0; cursor:pointer; }
    .hint { text-align:center; color:#64748b; font-size:12px; margin:8px 0 0; }
    .divider { text-align:center; color:#94a3b8; font-size:12px; margin:18px 0 12px; }
    label { font-size:12px; color:#475569; display:block; margin-bottom:6px; }
    input { width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:10px; font-size:16px;
            text-transform:uppercase; letter-spacing:1px; }
    button.conn { width:100%; margin-top:12px; padding:13px; border:0; border-radius:10px;
             background:#334155; color:#fff; font-weight:700; font-size:16px; }
    .err { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:10px;
           border-radius:10px; font-size:13px; margin-bottom:14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="dot"><img src="https://reconcavo-voucher.vercel.app/logo.png" alt="RV"></div>
      <div>
        <h1>Recôncavo Voucher</h1>
        <p class="sub">${nome} — Wi-Fi por hora, dia ou mês</p>
      </div>
    </div>

    $(if error)<div class="err">$(error)</div>$(endif)

    $(if trial == 'yes')
    <form name="trialform" action="$(link-login-only)" method="post">
      <input type="hidden" name="username" value="T-$(mac)">
      <input type="hidden" name="password" value="">
      <input type="hidden" name="dst" value="$(link-orig)">
    </form>
    <script>
      (function () {
        var orig = "$(link-orig)";
        if (orig.indexOf("/order/") > -1) {
          try { document.trialform.dst.value = orig + (orig.indexOf("#") > -1 ? "&" : "#") + "tmac=$(mac)"; } catch (e) {}
          document.trialform.submit();
        }
      })();
    </script>
    $(endif)

    <a class="buy" id="btnLoja" href="https://reconcavo-voucher.vercel.app/?loja=${slug}">Abrir a loja e comprar</a>
    <p class="hint">Vai abrir no seu navegador. Escolha o plano e pague no Pix ou cartão.</p>

    <div class="divider">— já tenho um voucher —</div>

    <form name="login" action="$(link-login-only)" method="post"
          onsubmit="document.login.password.value=document.login.username.value">
      <input type="hidden" name="dst" value="$(link-orig)">
      <input type="hidden" name="popup" value="true">
      <input type="hidden" name="password" value="">
      <label for="username">Código do voucher</label>
      <input id="username" name="username" placeholder="REC-XXXX" autocapitalize="characters" autocomplete="off" required>
      <button type="submit" class="conn">Conectar</button>
    </form>
  </div>

  <script>
    (function () {
      var btn = document.getElementById("btnLoja");
      if (/Android/i.test(navigator.userAgent || "")) {
        btn.setAttribute("href", "intent://reconcavo-voucher.vercel.app/?loja=${slug}#Intent;scheme=https;package=com.android.chrome;end");
      }
    })();
    // Trocar trial -> voucher: hash (#rvconnect) -> localStorage -> query.
    (function () {
      try {
        var h = new URLSearchParams(location.hash.replace(/^#/, ""));
        var q = new URLSearchParams(location.search);
        var code = h.get("rvconnect") || localStorage.getItem("rvconnect") || q.get("rvconnect");
        var dst = h.get("dst") || q.get("dst");
        if (code && document.login) {
          localStorage.removeItem("rvconnect");
          try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
          if (dst && document.login.dst) { document.login.dst.value = dst; }
          document.login.username.value = code;
          document.login.password.value = code;
          document.login.submit();
        }
      } catch (e) {}
    })();
  </script>
</body>
</html>`;

const LOGOUT = `<!-- logout.html — Recôncavo Voucher (servido pela nuvem). -->
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Recôncavo Voucher</title>
  <script>
    (function () {
      try {
        var hash = location.hash || "";
        if (hash.indexOf("rvconnect=") > -1) { location.href = "$(link-login-only)" + hash; }
      } catch (e) {}
    })();
  </script>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;
           background:#0f3d2e; color:#fff; min-height:100vh;
           display:flex; align-items:center; justify-content:center; padding:16px; }
    .card { background:#fff; color:#0f172a; border-radius:16px; padding:24px; width:100%;
            max-width:360px; box-shadow:0 10px 40px rgba(0,0,0,.25); text-align:center; }
    h1 { font-size:18px; margin:0 0 6px; color:#135B1D; }
    p { color:#49784C; font-size:14px; margin:4px 0; }
    a.btn { display:inline-block; margin-top:14px; text-decoration:none; background:#0f3d2e;
            color:#fff; font-weight:700; padding:12px 20px; border-radius:10px; font-size:15px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Você saiu</h1>
    <p>Desconectado da rede.</p>
    <a class="btn" href="$(link-login)">Entrar novamente</a>
  </div>
</body>
</html>`;

const STATUS = `<!-- status.html — Recôncavo Voucher (servido pela nuvem). -->
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Recôncavo Voucher</title>
  <script>
    (function () {
      try {
        var code = new URLSearchParams(location.hash.replace(/^#/, "")).get("rvconnect");
        if (!code) { code = new URLSearchParams(location.search).get("rvconnect"); }
        if (code) {
          try { localStorage.setItem("rvconnect", code); } catch (e) {}
          location.href = "$(link-logout)#rvconnect=" + encodeURIComponent(code);
        }
      } catch (e) {}
    })();
  </script>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;
           background:#0f3d2e; color:#fff; min-height:100vh;
           display:flex; align-items:center; justify-content:center; padding:16px; }
    .card { background:#fff; color:#0f172a; border-radius:16px; padding:24px; width:100%;
            max-width:360px; box-shadow:0 10px 40px rgba(0,0,0,.25); text-align:center; }
    h1 { font-size:18px; margin:0 0 6px; color:#135B1D; }
    p { color:#49784C; font-size:14px; margin:4px 0; }
    a.btn { display:inline-block; margin-top:14px; text-decoration:none; background:#0f3d2e;
            color:#fff; font-weight:700; padding:12px 20px; border-radius:10px; font-size:15px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Você está conectado</h1>
    <p>Usuário: $(username)</p>
    <p>Tempo conectado: $(uptime)</p>
    <a class="btn" href="$(link-logout)">Sair</a>
  </div>
</body>
</html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const htmlHeaders = { ...corsHeaders, "content-type": "text/html; charset=utf-8" };
  try {
    const url = new URL(req.url);
    const loja = (url.searchParams.get("loja") ?? "").trim().toLowerCase();
    const f = (url.searchParams.get("f") ?? "login").trim();

    if (f === "logout") return new Response(LOGOUT, { headers: htmlHeaders });
    if (f === "status") return new Response(STATUS, { headers: htmlHeaders });
    if (f === "install") {
      if (!loja) return new Response("# loja obrigatorio\n", { status: 400, headers: { ...corsHeaders, "content-type": "text/plain; charset=utf-8" } });
      return new Response(installRsc(loja), { headers: { ...corsHeaders, "content-type": "text/plain; charset=utf-8" } });
    }

    // login: precisa do slug; busca o nome do ponto no banco.
    if (!loja) return new Response("<!-- loja obrigatorio -->", { status: 400, headers: htmlHeaders });
    const svc = serviceClient();
    const { data: loc } = await svc.from("locations").select("name").eq("slug", loja).maybeSingle();
    const nome = (loc?.name as string) ?? loja;
    return new Response(loginHtml(loja, nome), { headers: htmlHeaders });
  } catch (e) {
    return new Response("<!-- erro: " + (e as Error).message + " -->", { status: 500, headers: htmlHeaders });
  }
});
