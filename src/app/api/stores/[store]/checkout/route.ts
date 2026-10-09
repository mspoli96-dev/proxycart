import { storeCheckoutResponse } from "../../../../../lib/server/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ store: string }> }): Promise<Response> {
  return storeCheckoutResponse(request, (await params).store);
}
