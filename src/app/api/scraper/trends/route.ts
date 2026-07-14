import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARALLEL_COMPONENT_DISABLED = "PARALLEL_COMPONENT_DISABLED: Oracle Worker is the only Discovery authority";

export async function POST() {
  return NextResponse.json({ ok: false, code: "PARALLEL_COMPONENT_DISABLED", message: PARALLEL_COMPONENT_DISABLED }, { status: 410 });
}
