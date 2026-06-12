import { NextResponse } from "next/server";
import { testTelegramConnection } from "@/lib/telegram/client";

export async function POST() {
  const result = await testTelegramConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
