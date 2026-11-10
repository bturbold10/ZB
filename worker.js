// ============================================================
//  Cloudflare Worker (нэг файл):
//   • сайтын файлуудыг (dist/) харуулна
//   • /api/auth, /api/callback — админы GitHub нэвтрэлт
//  Cloudflare-ийн Settings → Variables and secrets хэсэгт:
//    GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (хоёулаа Secret)
// ============================================================

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/auth") return handleAuth({ request, env });
    if (pathname === "/api/callback") return handleCallback({ request, env });
    return env.ASSETS.fetch(request);
  }
};

// ============================================================
//  Админ нэвтрэлт (1/2): GitHub-ийн нэвтрэх хуудас руу шилжүүлнэ.
//  Cloudflare Pages-ийн тохиргоонд дараах хоёр утга байх ёстой:
//    GITHUB_CLIENT_ID      — GitHub OAuth App-ийн Client ID
//    GITHUB_CLIENT_SECRET  — GitHub OAuth App-ийн Client secret
// ============================================================
async function handleAuth({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response("GITHUB_CLIENT_ID тохируулаагүй байна (Cloudflare Pages → Settings → Variables and Secrets).", { status: 500 });
  }
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  const gh = new URL("https://github.com/login/oauth/authorize");
  gh.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  gh.searchParams.set("redirect_uri", `${url.origin}/api/callback`);
  gh.searchParams.set("scope", "repo,user");
  gh.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: gh.toString(),
      "Set-Cookie": `zb_oauth_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "Cache-Control": "no-store"
    }
  });
}

// ============================================================
//  Админ нэвтрэлт (2/2): GitHub-ээс буцаж ирээд түлхүүрийг (token)
//  админ хуудас руу дамжуулна. Decap CMS-ийн стандарт аргачлал.
// ============================================================
async function handleCallback({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("Cookie") || "";
  const saved = (cookie.match(/(?:^|;\s*)zb_oauth_state=([^;]+)/) || [])[1];

  let status = "error";
  let content;
  if (!code || !state || !saved || state !== saved) {
    content = { error: "Нэвтрэлтийн хүсэлт хүчингүй боллоо. Админ хуудсыг дахин нээгээд оролдоно уу." };
  } else {
    try {
      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "zb-site-cms" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${url.origin}/api/callback`
        })
      });
      const data = await r.json();
      if (data.access_token) {
        status = "success";
        content = { token: data.access_token, provider: "github" };
      } else {
        content = { error: data.error_description || data.error || "GitHub түлхүүр олгосонгүй." };
      }
    } catch (e) {
      content = { error: "GitHub-тэй холбогдож чадсангүй." };
    }
  }

  // Decap CMS-ийн popup протокол: эхлээд "authorizing:github" илгээж,
  // админ хуудас хариу өгөхөд токеноо дамжуулаад цонхоо хаана.
  const message = JSON.stringify(`authorization:github:${status}:${JSON.stringify(content)}`).replace(/</g, "\\u003c");
  const origin = JSON.stringify(url.origin);
  const html = `<!doctype html><html lang="mn"><head><meta charset="utf-8"><title>Нэвтэрч байна…</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px">
<p>${status === "success" ? "Амжилттай нэвтэрлээ. Энэ цонх автоматаар хаагдана…" : "Нэвтэрч чадсангүй. Энэ цонхыг хаагаад дахин оролдоно уу."}</p>
<script>
(function () {
  var origin = ${origin}, message = ${message};
  if (!window.opener) return;
  function receive(e) {
    if (e.origin !== origin) return;
    window.opener.postMessage(message, origin);
    window.removeEventListener("message", receive, false);
    setTimeout(function () { window.close(); }, 300);
  }
  window.addEventListener("message", receive, false);
  window.opener.postMessage("authorizing:github", origin);
})();
</script></body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": "zb_oauth_state=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
    }
  });
}