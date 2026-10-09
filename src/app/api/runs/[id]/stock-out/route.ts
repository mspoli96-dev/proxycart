import { stockOutResponse } from "../../../../../lib/server/handlers";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return stockOutResponse(request, (await params).id);
}
