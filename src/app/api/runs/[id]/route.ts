import { snapshotResponse } from "../../../../lib/server/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return snapshotResponse(request, (await params).id);
}
