"use server";

import { revalidatePath } from "next/cache";
import { rejectShopeeCandidateAction, selectShopeeCandidateAction } from "@/lib/offers/actions";

export async function approveTrendShopeeOfferAction(formData: FormData) {
  await selectShopeeCandidateAction(formData);
  revalidatePath("/trends");
}

export async function rejectTrendShopeeOfferAction(formData: FormData) {
  await rejectShopeeCandidateAction(formData);
  revalidatePath("/trends");
}
