"use client";

import { useState } from "react";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GenerateAIMessagesButton({
  offerId,
  hasDrafts = false,
}: {
  offerId: string;
  hasDrafts?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError("");

    try {
      const requestedAt = new Date().toISOString();
      const commandId = `ui_generate_${offerId}_${Date.now()}`;
      
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, requestedAt, commandId, copyV2: true, regenerateCopyV2: true })
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        setGenerated(true);
      } else {
        setError(data.message || "Falha ao gerar textos por IA.");
      }
    } catch {
      setError("Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 shrink-0">
      <Button 
        disabled={loading || hasDrafts || generated}
        onClick={handleGenerate} 
        type="button"
        className="bg-moss hover:bg-ink text-white font-bold text-xs px-3 py-1.5 min-h-8"
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" size={12} />
            Gerando...
          </>
        ) : (
          <>
            <Sparkles size={12} />
            {hasDrafts || generated ? "Copys prontas" : "Gerar Copys com Groq AI"}
          </>
        )}
      </Button>
      {error && <p className="text-[10px] text-red-500 font-semibold">{error}</p>}
    </div>
  );
}

export function CopyToClipboardButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (
    <Button 
      onClick={handleCopy} 
      variant="secondary" 
      type="button" 
      className="min-h-8 px-3 py-1 text-xs shrink-0"
    >
      {copied ? (
        <>
          <Check size={12} className="text-moss" />
          Copiado!
        </>
      ) : (
        <>
          <Copy size={12} />
          Copiar Texto
        </>
      )}
    </Button>
  );
}
