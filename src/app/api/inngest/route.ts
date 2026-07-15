import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { 
  publishPostBackground, 
  processOfferBackground, 
  processOfferCycleBackground,
  syncAnalyticsBackground,
  runUserScrapingBackground,
  processClickBackground,
  instagramPollingBackground
} from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    publishPostBackground,
    processOfferBackground,
    processOfferCycleBackground,
    syncAnalyticsBackground,
    runUserScrapingBackground,
    processClickBackground,
    instagramPollingBackground
  ],
});
