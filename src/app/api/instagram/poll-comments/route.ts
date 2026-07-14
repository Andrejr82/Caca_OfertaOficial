import { NextResponse } from "next/server";

const PARALLEL_COMPONENT_DISABLED = "PARALLEL_COMPONENT_DISABLED: auxiliary jobs cannot access publication transports";

export async function GET() {
  return NextResponse.json({ ok: false, code: "PARALLEL_COMPONENT_DISABLED", message: PARALLEL_COMPONENT_DISABLED }, { status: 410 });
}
