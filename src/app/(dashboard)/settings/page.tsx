import { officialBrand } from "@/lib/env";
import { getIntegrationStatuses } from "@/lib/security/integrations";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GeneralSettingsForm } from "@/components/dashboard/general-settings-form";
import { Settings, Globe, Plug } from "lucide-react";

export default async function SettingsPage() {
  const statuses = getIntegrationStatuses();

  const supabase = await createServerSupabaseClient();
  let initialSettings = {
    cron_scraping_enabled: false,
    notifications_enabled: false
  };

  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("user_id", user.id)
        .eq("key", "general_settings")
        .maybeSingle();

      if (data?.value) {
        initialSettings = {
          cron_scraping_enabled: !!data.value.cron_scraping_enabled,
          notifications_enabled: !!data.value.notifications_enabled
        };
      }
    }
  }

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-slate-500 to-gray-700 shadow-lg shadow-slate-500/20">
          <Settings size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Configurações</h1>
          <p className="text-xs text-white/35">Configuração de canais, integrações e segurança da plataforma.</p>
        </div>
      </header>

      <SettingsTabs activeTab="general" />

      {/* Preferences */}
      <GeneralSettingsForm initialSettings={initialSettings} />

      {/* Official Channels */}
      <section className="glass-card p-5">
        <div className="flex items-center gap-2 border-b border-white/[0.04] pb-3 mb-4">
          <Globe size={14} className="text-sky-400" />
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Canais Oficiais</h2>
        </div>
        <dl className="grid gap-3 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-white/[0.03] p-3">
            <dt className="font-bold text-white/60">Instagram</dt>
            <dd className="text-white/40">{officialBrand.instagram}</dd>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/[0.03] p-3">
            <dt className="font-bold text-white/60">Telegram</dt>
            <dd className="text-white/40">{officialBrand.telegramName} - {officialBrand.telegramUrl}</dd>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/[0.03] p-3">
            <dt className="font-bold text-white/60">WhatsApp</dt>
            <dd className="text-white/40">{officialBrand.whatsappName}</dd>
          </div>
        </dl>
      </section>

      {/* Integrations */}
      <section className="glass-card p-5">
        <div className="flex items-center gap-2 border-b border-white/[0.04] pb-3 mb-4">
          <Plug size={14} className="text-emerald-400" />
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Integrações</h2>
        </div>
        <div className="space-y-2">
          {statuses.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.03] p-3 transition-colors hover:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <span
                  className={`status-dot ${
                    item.status === "configured" ? "status-dot--active"
                    : item.status === "future" ? "status-dot--future"
                    : "status-dot--warn"
                  }`}
                />
                <div>
                  <p className="text-sm font-semibold text-white/70">{item.name}</p>
                  <p className="text-[11px] text-white/30">{item.detail}</p>
                </div>
              </div>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  item.status === "configured"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : item.status === "future"
                    ? "bg-sky-500/15 text-sky-400"
                    : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
