export const OFFICIAL_AI_CYCLE_PAGE_SIZE = 50;

export interface OfficialAICyclePage {
  correlationId: string;
  pageNumber: number;
  totalPages: number;
  idempotencyKey: string;
  offerIds: readonly string[];
}

export interface OfficialAICyclePageOutcome {
  status: "completed" | "rejected";
  pageNumber: number;
  offerIds: readonly string[];
}

export function createOfficialAICyclePages(
  correlationId: string,
  offerIds: readonly string[]
): OfficialAICyclePage[] {
  const uniqueOfferIds = [...new Set(offerIds.filter((id) => typeof id === "string" && id.trim().length > 0))];
  const totalPages = Math.ceil(uniqueOfferIds.length / OFFICIAL_AI_CYCLE_PAGE_SIZE);
  return Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + 1;
    return {
      correlationId,
      pageNumber,
      totalPages,
      idempotencyKey: `ai:cycle:${correlationId}:page:${pageNumber}:v1`,
      offerIds: uniqueOfferIds.slice(index * OFFICIAL_AI_CYCLE_PAGE_SIZE, pageNumber * OFFICIAL_AI_CYCLE_PAGE_SIZE)
    };
  });
}

export async function processOfficialAICyclePages<T extends OfficialAICyclePageOutcome>(
  pages: readonly OfficialAICyclePage[],
  executePage: (page: OfficialAICyclePage) => Promise<T>
) {
  const results: T[] = [];
  for (const page of pages) results.push(await executePage(page));
  return {
    pagesProcessed: results.length,
    offersVisited: results.reduce((total, result) => total + result.offerIds.length, 0),
    batchCompleted: results.length === pages.length && results.every((result) => result.status === "completed" || result.status === "rejected"),
    results
  };
}
