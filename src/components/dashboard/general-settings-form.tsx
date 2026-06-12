"use client";

import React, { useState } from "react";
import { useToast } from "@/components/ui/toast-context";
import { Loader2, Save } from "lucide-react";

interface GeneralSettings {
  cron_scraping_enabled: boolean;
  notifications_enabled: boolean;
}

export function GeneralSettingsForm({ initialSettings }: { initialSettings: GeneralSettings }) {
  const { showToast } = useToast();
  const [cronEnabled, setCronEnabled] = useState(initialSettings.cron_scraping_enabled);
  const [notificationsEnabled, setNotificationsEnabled] = useState(initialSettings.notifications_enabled);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch("/api/settings/configs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          cron_scraping_enabled: cronEnabled,
          notifications_enabled: notificationsEnabled
        })
      });

      if (!response.ok) {
        throw new Error("Erro de rede ao salvar configurações");
      }

      const data = await response.json();
      if (data.ok) {
        showToast({
          title: "Configurações Salvas! 💾",
          description: "As preferências gerais de automação e alertas foram atualizadas.",
          duration: 4000
        });

        // Dispara o evento customizado para que o RealtimeListener atualize seu estado imediatamente
        const updateEvent = new CustomEvent("settings-updated", {
          detail: {
            cron_scraping_enabled: cronEnabled,
            notifications_enabled: notificationsEnabled
          }
        });
        window.dispatchEvent(updateEvent);
      } else {
        throw new Error(data.message || "Erro desconhecido ao salvar");
      }
    } catch (error) {
      console.error("Erro ao salvar configurações gerais:", error);
      showToast({
        title: "Erro ao Salvar ❌",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao tentar salvar as preferências.",
        duration: 5000
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="glass-card p-5">
      <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Preferências do Sistema</h2>
      <p className="text-[11px] text-white/25 mb-6">Controle as automações de segundo plano e alertas em tempo real.</p>

      <div className="space-y-6">
        {/* Toggle 1: Automatização de Scraping por Cron */}
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white/70">Automatização de Scraping por Cron</h3>
            <p className="text-[11px] text-white/30">
              Permite que o sistema execute de forma automática o robô de tendências a cada intervalo definido no servidor para buscar novas ofertas nas plataformas conectadas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCronEnabled(!cronEnabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-[#060a13] ${
              cronEnabled ? "bg-emerald-500" : "bg-white/10"
            }`}
            role="switch"
            aria-checked={cronEnabled}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                cronEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <hr className="border-white/[0.04]" />

        {/* Toggle 2: Notificações em Tempo Real */}
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white/70">Notificações em Tempo Real</h3>
            <p className="text-[11px] text-white/30">
              Exibe alertas instantâneos na tela (pop-ups flutuantes) sempre que uma nova oferta for inserida no sistema por você ou pelo robô em segundo plano.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-[#060a13] ${
              notificationsEnabled ? "bg-emerald-500" : "bg-white/10"
            }`}
            role="switch"
            aria-checked={notificationsEnabled}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                notificationsEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition-all hover:from-emerald-500 hover:to-emerald-400 hover:shadow-emerald-500/35 active:scale-[0.98] disabled:opacity-40"
        >
          {saving ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              Salvando...
            </>
          ) : (
            <>
              <Save size={16} />
              Salvar Configurações
            </>
          )}
        </button>
      </div>
    </form>
  );
}
