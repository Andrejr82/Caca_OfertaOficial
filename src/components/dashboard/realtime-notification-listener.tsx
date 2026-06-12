"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useToast } from "@/components/ui/toast-context";
import { useRouter } from "next/navigation";

export function RealtimeNotificationListener() {
  const supabase = createClient();
  const { showToast } = useToast();
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  // 1. Carrega as configurações iniciais do usuário
  useEffect(() => {
    async function loadSettingsAndUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const response = await fetch("/api/settings/configs");
        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.settings) {
            setEnabled(data.settings.notifications_enabled === true);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar configurações de notificação no listener:", err);
      }
    }

    loadSettingsAndUser();

    // Ouvir alterações dinâmicas nas configurações salvas no formulário
    const handleSettingsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.notifications_enabled === "boolean") {
        setEnabled(customEvent.detail.notifications_enabled);
      }
    };

    window.addEventListener("settings-updated", handleSettingsUpdate);
    return () => {
      window.removeEventListener("settings-updated", handleSettingsUpdate);
    };
  }, [supabase]);

  // 2. Configura a assinatura Realtime do Supabase quando ativado
  useEffect(() => {
    // Limpa a conexão antiga se houver
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (!enabled || !userId) return;

    console.log(`[REALTIME] Ativando listener realtime para o usuário: ${userId}`);

    // Cria o canal para ouvir novos inserts na tabela offers
    const channel = supabase
      .channel(`realtime-user-offers-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "offers",
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log("[REALTIME] Nova oferta capturada:", payload);
          const newOffer = payload.new;

          // Exibe o toast premium
          showToast({
            id: newOffer.id,
            title: "Nova Oferta Encontrada! ✨",
            description: `${newOffer.product_name} por R$ ${Number(newOffer.current_price).toFixed(2)}`,
            imageUrl: newOffer.image_url,
            actionText: "Ver Oferta",
            onAction: () => {
              router.push("/offers");
              router.refresh();
            }
          });
        }
      )
      .subscribe((status) => {
        console.log(`[REALTIME] Status da inscrição realtime: ${status}`);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, userId, supabase, showToast, router]);

  // Este componente apenas escuta e não renderiza nada visualmente por si só
  return null;
}
