import { NextResponse } from "next/server";
import { persistCouponDrafts } from "@/lib/coupons/persist-coupon-drafts";
import { normalizeManualCouponInput, validateManualCouponInput } from "@/lib/coupons/manual-coupon";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const input = normalizeManualCouponInput(payload);
    const validation = validateManualCouponInput(input);
    if (!validation.ok) {
      return NextResponse.json({ ok: false, errors: validation.errors }, { status: 400 });
    }

    const result = await persistCouponDrafts([{
      marketplace: input.marketplace,
      code: input.code,
      discount: input.discount,
      rules: `${input.rules} | Validade: ${input.validity}`,
      link: input.link,
      image_url: input.imageUrl || null
    }]);

    return NextResponse.json({ ok: result.status !== "error", result }, { status: result.status === "error" ? 502 : 200 });
  } catch (error) {
    console.error("[MANUAL-COUPON] Falha ao cadastrar cupom:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível cadastrar o cupom." }, { status: 500 });
  }
}
