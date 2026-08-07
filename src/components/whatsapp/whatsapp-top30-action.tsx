"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareTop30WhatsappLegacyDraftsAction, type Top30WhatsappActionResult } from "@/app/(dashboard)/whatsapp/actions";

export function WhatsappTop30Action() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Top30WhatsappActionResult | null>(null);

  function handlePrepare() {
    startTransition(async () => {
      const nextResult = await prepareTop30WhatsappLegacyDraftsAction();
      setResult(nextResult);
      if (nextResult.ok) router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={handlePrepare} disabled={pending} className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-50">
        {pending ? "Atualizando..." : "Atualizar melhores ofertas"}
      </button>
      {result && (
        <span role="status" className={result.ok ? "text-xs text-emerald-200" : "text-xs text-red-200"}>
          {result.ok ? `${result.created} criados · ${result.reused} reutilizados · ${result.skipped} pulados · ${result.windowUsed}` : result.message}
        </span>
      )}
    </div>
  );
}
