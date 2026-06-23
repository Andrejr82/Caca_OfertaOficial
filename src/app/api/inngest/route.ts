import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { 
  publishPostBackground, 
  processOfferBackground, 
  syncAnalyticsBackground,
  runUserScrapingBackground,
  processClickBackground
} from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    publishPostBackground,
    processOfferBackground,
    syncAnalyticsBackground,
    runUserScrapingBackground,
    processClickBackground
  ],
});
