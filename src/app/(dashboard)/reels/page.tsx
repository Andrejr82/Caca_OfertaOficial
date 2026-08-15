import { createServerSupabaseClient } from "@/lib/supabase/server";
import { autoReelStatusLabel } from "@/lib/videos/auto-reel";
import { CreativeCertificationPanel } from "@/app/(dashboard)/videos/CreativeCertificationPanel";
import { AutoReelClient } from "./AutoReelClient";
import { AuthorizedReelsClient } from "./AuthorizedReelsClient";

function jobStatusLabel(job: any) {
  if (job.stage === "awaiting_oracle_verification") return "Aguardando verificação do arquivo";
  if (job.status === "ready") return "Pronto para certificação";
  if (job.status === "approved") return "Aprovado";
  if (job.status === "failed") return "Falhou";
  return job.status;
}

export default async function AuthorizedReelsPage() {
  const supabase = await createServerSupabaseClient();
  let offers: any[] = [];
  let jobs: any[] = [];
  let autoJobs: any[] = [];

  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (user) {
      const [{ data: offerData }, { data: jobData }, { data: autoJobData }] = await Promise.all([
        supabase
          .from("offers")
          .select("id,product_name,platform,current_price,image_url")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("video_jobs")
          .select("id,status,stage,video_url,metadata,created_at,offers(id,product_name,platform,current_price)")
          .eq("user_id", user.id)
          .contains("metadata", { source: "authorized-reel" })
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("video_jobs")
          .select("id,status,stage,metadata,created_at,offers(id,product_name,platform,current_price,image_url)")
          .eq("user_id", user.id)
          .eq("template_id", "auto-reel-v1")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      offers = offerData ?? [];
      jobs = jobData ?? [];
      autoJobs = autoJobData ?? [];
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Criativos autorizados</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Reels / Criativos</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/45">Fluxo separado dos vídeos gerados por Gemini: importe um MP4 autorizado, associe ao produto e certifique antes da aprovação social.</p>
      </header>

      <AutoReelClient offers={offers} />
      {autoJobs.length > 0 && (
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
          <h2 className="font-bold text-white">Reels automáticos</h2>
          <div className="mt-3 space-y-2">
            {autoJobs.map((job) => <div key={job.id} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-sm"><span className="text-white/70">{job.offers?.product_name ?? "Oferta"}</span><span className="text-fuchsia-200">{autoReelStatusLabel(job.stage ?? job.status)}</span></div>)}
          </div>
        </section>
      )}
      <AuthorizedReelsClient offers={offers} />
      <CreativeCertificationPanel jobs={jobs} />

      <section className="space-y-3">
        <div>
          <h2 className="font-bold text-white">Criativos importados</h2>
          <p className="mt-1 text-xs text-white/45">O upload vai direto ao Supabase. A certificação só é liberada após a verificação real do arquivo fora da Vercel.</p>
        </div>
        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-sm text-white/45">Nenhum criativo autorizado importado ainda.</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {jobs.map((job) => (
              <article key={job.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                {job.video_url && <video src={job.video_url} controls playsInline preload="metadata" className="max-h-[420px] w-full rounded-xl bg-black" />}
                <div className="mt-3">
                  <p className="text-sm font-semibold text-white">{job.offers?.product_name ?? "Produto associado"}</p>
                  <p className="mt-1 text-xs text-white/45">{jobStatusLabel(job)} · Direito declarado: {job.metadata?.rightsDeclaration?.status ?? "pendente"}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
