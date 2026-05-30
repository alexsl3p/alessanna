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

  if (hostname !== "work.alessannailu.com") return; // landing page: pass through

  // Requests already pointing at /_crm_dist/ (internal re-fetch) — serve directly
  if (pathname.startsWith("/_crm_dist/")) return;

  // Build the internal URL pointing at the CRM build directory
  const internal = new URL(request.url);
  internal.pathname = "/_crm_dist" + (pathname === "/" ? "/" : pathname);

  const res = await fetch(internal.toString(), {
    headers: request.headers,
    redirect: "manual",
  });

  // 404 = React Router client-side route → serve CRM's index.html (SPA fallback)
  if (res.status === 404) {
    internal.pathname = "/_crm_dist/index.html";
    return fetch(internal.toString());
  }

  return res;
}

export const config = {
  matcher: ["/((?!api/).*)"], // run on all paths except /api/
};
