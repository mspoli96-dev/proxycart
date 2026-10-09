import { NextResponse, type NextRequest } from "next/server";
import { storeForHost } from "./lib/hosts";

const RUN_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const STORE_PAGES = new Set(["/", "/checkout", "/sign-in"]);

function withRunCookie(response: NextResponse, runId: string | null, secure: boolean): NextResponse {
  if (runId) response.cookies.set("pxc_run", runId, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 3 * 60 * 60 });
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const url = request.nextUrl;
  const runParam = url.searchParams.get("run");
  const runId = runParam && RUN_PATTERN.test(runParam) ? runParam : null;
  const storeId = storeForHost(request.headers.get("host"));
  if (!storeId) {
    return url.pathname.startsWith("/stores/") ? withRunCookie(NextResponse.next(), runId, url.protocol === "https:") : NextResponse.next();
  }
  if (url.pathname.startsWith("/api/stores/")) return NextResponse.next();
  if (!STORE_PAGES.has(url.pathname)) return new NextResponse("Not found", { status: 404 });
  const target = url.clone();
  target.pathname = url.pathname === "/" ? `/stores/${storeId}` : `/stores/${storeId}${url.pathname}`;
  return withRunCookie(NextResponse.rewrite(target), runId, true);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mark.svg|social-preview.png|recorded/).*)"],
};
