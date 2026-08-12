import type { MultimarketplaceApprovalProduct } from "@/lib/trends/multimarketplace-approval-queue";

export const APPROVAL_QUEUE_MAX_TRENDS = 5;

export function selectApprovalQueueProducts(
  products: MultimarketplaceApprovalProduct[],
  limit = APPROVAL_QUEUE_MAX_TRENDS,
): MultimarketplaceApprovalProduct[] {
  return products
    .filter((product) => ["verified", "partial"].includes(product.evidence_status))
    .sort((left, right) => left.priority - right.priority)
    .slice(0, Math.max(1, Math.min(APPROVAL_QUEUE_MAX_TRENDS, Math.trunc(limit))));
}
