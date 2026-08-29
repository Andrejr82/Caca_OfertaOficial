import { ExternalLink, FlaskConical, ShieldX } from "lucide-react";
import type { TrendRadarSnapshotView, TrendRadarSnapshotProductView } from "@/lib/trends/radar-queries";
import { approveTrendTestAction, ignoreTrendProductAction } from "@/lib/trends/selection-actions";
import { supportsTrendApprovalMarketplace } from "@/lib/trends/selection-offer-state";

const NICHE_ORDER = ["Casa, Cozinha e Organização","Beleza e Cuidados Pessoais","Moda e Calçados","Eletrodomésticos","Informática","Ferramentas","Pet"];
const BRL = new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" });
const score=(value:number|null)=>value==null?"n/d":`${Math.round(value*10)/10}/100`;

function evidenceText(item:TrendRadarSnapshotProductView){
  if(item.salesDelta!=null&&item.salesDelta>0) return `+${Math.round(item.salesDelta)} vendas na janela observada`;
  if(item.rankDelta!=null&&item.rankDelta>0&&item.previousRank!=null&&item.currentRank!=null) return `ranking ${item.previousRank} → ${item.currentRank}`;
  return item.trendReasons[0]?.replaceAll("_"," ") || "tendência confirmada por evidência nativa";
}

export function TrendsDailySelectionDesk({snapshot,approvalFeedback=null}:{snapshot:TrendRadarSnapshotView|null;approvalFeedback?:{productId:string;message:string;kind?:"success"|"error"}|null}){
  const products=snapshot?.products??[];
  const groups=NICHE_ORDER.map((label)=>({label,items:products.filter((p)=>(p.nicheLabel||p.category)===label)}));
  return <section className="grid gap-5">
    <div className="glass-card p-5"><h2 className="text-base font-extrabold text-white">Tendências do Dia</h2><p className="mt-1 text-xs text-white/40">Somente produtos com evidência real de tendência. Trend Score mede tendência; Commercial Score mede oportunidade comercial.</p></div>
    {groups.map(({label,items})=><div key={label} className="grid gap-3">
      <div className="flex items-center justify-between"><h3 className="text-sm font-black text-white">{label}</h3><span className="text-[11px] text-white/35">{items.length} tendência{items.length===1?"":"s"}</span></div>
      {!items.length?<div className="glass-card px-4 py-5 text-sm text-white/35">Nenhuma tendência com evidência suficiente hoje.</div>:items.map((item)=>{
        const sourceUrl=item.directEvidenceSourceUrls[0]??null; const handedOff=Boolean(item.selectedOfferId&&item.selectionDecision==="APROVAR_TESTE"); const canApprove=item.evidenceStatus==="verified"&&item.offerAvailable===true&&supportsTrendApprovalMarketplace(item.marketplace); const feedback=approvalFeedback?.productId===item.id?approvalFeedback:null;
        return <article key={item.id} className="glass-card p-4"><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px]">
          <div><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-wider text-cyan-300">Trend {score(item.trendScore)} · Commercial {score(item.commercialScore)}</p><h4 className="mt-1 text-base font-extrabold text-white">{item.productTerm}</h4><p className="mt-1 text-xs text-white/35">{item.marketplace||"Marketplace"}</p></div>{sourceUrl?<a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-cyan-300 underline">Ver fonte <ExternalLink size={11}/></a>:null}</div>
          {feedback?<div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${feedback.kind==="success"?"border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200":"border-amber-400/20 bg-amber-400/[0.06] text-amber-200"}`}>{feedback.message}</div>:null}
          {handedOff?<div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-xs font-semibold text-emerald-200">Tendência aprovada e oferta selecionada para preparação comercial.</div>:null}
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3"><div className="rounded-lg border border-white/[0.05] p-2"><p className="text-white/30">Evidência</p><p className="mt-1 font-bold text-white/75">{evidenceText(item)}</p></div><div className="rounded-lg border border-white/[0.05] p-2"><p className="text-white/30">Demanda</p><p className="mt-1 font-bold text-white/75">{item.sales!=null?`${Math.round(item.sales)} vendas`:"n/d"}</p><p className="text-[10px] text-white/30">{item.salesVelocity!=null?`velocity +${Math.round(item.salesVelocity*100)/100}`:item.velocityStatus||"sem histórico"}</p></div><div className="rounded-lg border border-white/[0.05] p-2"><p className="text-white/30">Preço</p><p className="mt-1 font-bold text-white/75">{item.price!=null?BRL.format(item.price):"n/d"}</p></div></div>
          <div className="mt-3 grid gap-1">{(item.trendReasons.length?item.trendReasons:item.determiningReasons).slice(0,4).map((reason)=><p key={reason} className="text-xs text-white/40">{reason.replaceAll("_"," ")}</p>)}</div></div>
          <div className="grid content-start gap-2">{canApprove?<form action={approveTrendTestAction}><input type="hidden" name="product_id" value={item.id}/><button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-emerald-950"><FlaskConical size={14}/>{handedOff?"Preparar redes sociais":"Aprovar teste"}</button></form>:<div className="rounded-lg border border-white/[0.08] px-3 py-2 text-center text-xs font-bold text-white/35">Somente monitoramento</div>}<form action={ignoreTrendProductAction}><input type="hidden" name="product_id" value={item.id}/><button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/25 px-3 py-2 text-xs font-bold text-red-300"><ShieldX size={14}/>Ignorar</button></form></div>
        </div></article>;
      })}
    </div>)}
  </section>;
}
