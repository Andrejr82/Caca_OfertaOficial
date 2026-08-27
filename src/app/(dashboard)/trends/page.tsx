import { BrainCircuit } from "lucide-react";
import { DailyRadarRefreshButton } from "@/components/trends/daily-radar-refresh-button";
import { TrendsDailySelectionDesk } from "@/components/trends/trends-daily-selection-desk";
import { listLatestTrendRadarSnapshot } from "@/lib/trends/radar-queries";
import { TREND_REJECTED_OFFER_MESSAGE, TREND_MISSING_IMAGE_MESSAGE } from "@/lib/trends/selection-offer-state";

type TrendsPageSearchParams = Promise<Record<string,string|string[]|undefined>>;

export default async function TrendsPage({searchParams}:{searchParams?:TrendsPageSearchParams}){
  const latestSnapshot=await listLatestTrendRadarSnapshot(); const params=searchParams?await searchParams:{};
  const approvalError=typeof params.approval_error==="string"?params.approval_error:null; const feedbackProductId=typeof params.product_id==="string"?params.product_id:null;
  const message=approvalError==="offer_rejected"?TREND_REJECTED_OFFER_MESSAGE
    :approvalError==="trend_missing_image"?TREND_MISSING_IMAGE_MESSAGE
    :approvalError==="offer_unavailable"?"Esta oportunidade está vinculada a uma oferta indisponível para aprovação automática."
    :approvalError==="monetization_required"?"Esta oportunidade do Mercado Livre ainda não possui monetização válida. A aprovação foi bloqueada antes da criação dos links sociais."
    :null;
  const approvalFeedback=feedbackProductId&&message?{productId:feedbackProductId,message,kind:"error" as const}:null;
  return <div className="grid gap-6 animate-fadeIn"><header className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20"><BrainCircuit size={20} className="text-white"/></span><div><h1 className="text-2xl font-extrabold tracking-tight text-white">Tendências IA</h1><p className="text-xs text-white/35">Radar diário de tendências reais por 7 nichos.</p></div></div><DailyRadarRefreshButton latestRunId={latestSnapshot?.id??null} latestGeneratedAt={latestSnapshot?.generatedAt??null}/></header><TrendsDailySelectionDesk snapshot={latestSnapshot} approvalFeedback={approvalFeedback}/></div>;
}
