/**
 * Vercel Edge Middleware — domain-based routing.
 *
 * work.alessannailu.com  →  transparently proxied to /_crm_dist/ (CRM Vite build)
 * alessannailu.com       →  served normally (landing page static files)
 *
 * The CRM keeps its original URL structure: the user sees /admin/calendar,
 * not /_crm_dist/admin/calendar. React Router basename stays at '/'.
 */
export default async function middleware(request) {
  const url = new URL(request.url);
  const { hostname, pathname } = url;

  if (hostname !== "work.alessannailu.com") {
    // Preview deployments (*.vercel.app) serve the landing by default.
    // Visiting /?crm=1 switches this browser to the CRM via cookie, /?crm=0 back.
    if (!hostname.endsWith(".vercel.app")) return; // landing page: pass through
    const flag = url.searchParams.get("crm");
    if (flag === "1" || flag === "0") {
      const redirect = new URL(request.url);
      redirect.searchParams.delete("crm");
      return new Response(null, {
        status: 307,
        headers: {
          location: redirect.pathname + redirect.search,
          "set-cookie": `crm_preview=${flag}; Path=/; SameSite=Lax`,
        },
      });
    }
    const cookies = request.headers.get("cookie") || "";
    if (!/(?:^|;\s*)crm_preview=1/.test(cookies)) return; // landing page: pass through
  }

  // Requests already pointing at /_crm_dist/ (internal re-fetch) — serve directly
  if (pathname.startsWith("/_crm_dist/")) return;

  const internal = new URL(request.url);

  // Static assets (have a file extension) — proxy directly to _crm_dist.
  // Vercel may 308-redirect extensionless paths (e.g. /login → /login/), so
  // SPA routes are served from index.html immediately to avoid that redirect
  // being forwarded to the browser.
  const isAsset = /\.[a-zA-Z0-9]+$/.test(pathname);

  if (!isAsset) {
    // SPA route — always serve the app shell; React Router handles the path.
    internal.pathname = "/_crm_dist/index.html";
    return fetch(internal.toString(), { headers: request.headers });
  }

  internal.pathname = "/_crm_dist" + pathname;
  const res = await fetch(internal.toString(), {
    headers: request.headers,
    redirect: "manual",
  });

  if (res.status === 404) {
    internal.pathname = "/_crm_dist/index.html";
    return fetch(internal.toString());
  }

  return res;
}

export const config = {
  matcher: ["/((?!api/).*)"], // run on all paths except /api/
};
