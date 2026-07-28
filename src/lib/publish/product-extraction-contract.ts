import type { UrlResolveResult } from "./express-url-resolver";

export type ProductResolutionOutcome =
  | {
      status: "confirmed_identity";
      itemId: string;
      resolvedUrl: string;
    }
  | {
      status: "ready";
      resolvedUrl: string;
    }
  | {
      status: "rejected";
      code: NonNullable<UrlResolveResult["errorCode"]>;
    };

export function classifyResolution(result: UrlResolveResult): ProductResolutionOutcome {
  if (result.errorCode === "ANTI_BOT_REDIRECT_WITH_ORIGINAL_ID" && result.selectedItemId) {
    return {
      status: "confirmed_identity",
      itemId: result.selectedItemId,
      resolvedUrl: result.resolvedUrl,
    };
  }

  if (result.errorCode) {
    return { status: "rejected", code: result.errorCode };
  }

  return { status: "ready", resolvedUrl: result.resolvedUrl };
}
