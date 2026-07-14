const PARALLEL_COMPONENT_DISABLED = "PARALLEL_COMPONENT_DISABLED: automated publication must submit official commands";

export async function publishAutomatedOfferAction(affiliateUrl: string, isDryRun = true) {
  void affiliateUrl;
  void isDryRun;
  return { ok: false, status: "DISABLED", message: PARALLEL_COMPONENT_DISABLED };
}
