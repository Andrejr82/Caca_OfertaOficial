export type CouponDraftInput = {
  marketplace: string;
  code?: string | null;
  discount?: string | null;
  rules?: string | null;
  link: string;
  image_url?: string | null;
};

export type CouponDraftPersistenceResult = {
  status: "persisted" | "unauthenticated" | "error";
  offers: number;
  drafts: number;
  skipped: number;
  message: string;
};

export async function persistCouponDrafts(coupons: CouponDraftInput[]): Promise<CouponDraftPersistenceResult> {
  if (coupons.length === 0) {
    return { status: "persisted", offers: 0, drafts: 0, skipped: 0, message: "Nenhum cupom para preparar." };
  }

  return {
    status: "error",
    offers: 0,
    drafts: 0,
    skipped: coupons.length,
    message: "Cupons aguardam geração de copy pela Official AI; nenhum draft paralelo foi criado."
  };
}
