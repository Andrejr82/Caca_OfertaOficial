import { NextResponse } from "next/server";

const PARALLEL_COMPONENT_DISABLED = "PARALLEL_COMPONENT_DISABLED: Oracle Worker is the only Discovery authority";

function disabled() {
  return NextResponse.json({ ok: false, code: "PARALLEL_COMPONENT_DISABLED", message: PARALLEL_COMPONENT_DISABLED }, { status: 410 });
}

export async function GET() {
  return disabled();
}

export async function POST() {
  return disabled();
}
