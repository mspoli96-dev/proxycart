import { storeSignInResponse } from "../../../../../lib/server/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ store: string }> }): Promise<Response> {
  if ((await params).store !== "harbour") return new Response("Not found", { status: 404 });
  return storeSignInResponse(request);
}
