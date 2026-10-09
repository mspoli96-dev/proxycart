import { storeQuoteResponse } from "../../../../../lib/server/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ store: string }> }): Promise<Response> {
  return storeQuoteResponse(request, (await params).store);
}
