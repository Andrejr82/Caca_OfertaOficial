import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { loadEditorialTop30TelegramSelection } from "@/lib/telegram/select-editorial-top30-telegram-drafts";

process.env.DRY_RUN = "true";
process.env.NO_PUBLISH = "1";
process.env.TELEGRAM_AUTO_PUBLISH = "1";

const { createTelegramPublisher } = require("./telegram-auto-publisher.cjs") as {
  createTelegramPublisher: (options: Record<string, unknown>) => { processQueue: (options: Record<string, unknown>) => Promise<Record<string, unknown>> };
};

const now = new Date();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws as never },
});

function nowBrt(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(value);
}

async function main() {
  const selection = await loadEditorialTop30TelegramSelection(supabase, now);
  const publisher = createTelegramPublisher({ supabase, dryRun: true, logger: { log() {}, warn() {}, error() {} }, sleep: async () => {} });
  const publisherResult = await publisher.processQueue({ selectedEditorialTop30OfferIds: selection.offerIds });
  const diagnostics = selection.diagnostics;
  console.log(JSON.stringify({
    NOW_BRT: nowBrt(now),
    CURRENT_EXPECTED_SCENARIO: diagnostics.selectedCohortScenarioId,
    SELECTED_COHORT: diagnostics.selectedCohortScenarioId || "unknown",
    CORRELATION_ID: diagnostics.selectedCohortCorrelationId,
    DISCOVERED_AT: diagnostics.selectedCohortDiscoveredAt,
    SHOPEE_CANDIDATES: diagnostics.shopeeSelected,
    SHOPEE_SELECTED: diagnostics.shopeeSelected,
    AMAZON_CANDIDATES: diagnostics.amazonSelected,
    AMAZON_SELECTED: diagnostics.amazonSelected,
    ML_CANDIDATES: diagnostics.mercadoLivreSelected,
    ML_SELECTED: diagnostics.mercadoLivreSelected,
    STALE_COHORTS_IGNORED: diagnostics.staleCohortsIgnored,
    LOADED_ROWS: diagnostics.loadedRows,
    ELIGIBLE_DRAFT_OFFERS: diagnostics.eligibleDraftOffers,
    SELECTED_OFFER_IDS: publisherResult.acceptedPosts || [],
    PUBLISHER_INPUT_COUNT: publisherResult.publisherInputCount || 0,
    PUBLISHER_ACCEPTED_COUNT: publisherResult.publisherAcceptedCount || 0,
    PUBLISHER_SKIPPED_COUNT: publisherResult.publisherSkippedCount || 0,
    PUBLISHER_SKIPS: publisherResult.publisherSkips || [],
    RESULT: publisherResult.result,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ result: "error", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
