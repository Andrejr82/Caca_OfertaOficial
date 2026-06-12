"use client";

import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TelegramTestButton({ disabled }: { disabled: boolean }) {
  const [result, setResult] = useState<string>("");

  async function testConnection() {
    setResult("Testando...");
    const response = await fetch("/api/telegram/test", { method: "POST" });
    const payload = (await response.json()) as { message: string };
    setResult(payload.message);
  }

  return (
    <div className="grid gap-2">
      <Button disabled={disabled} onClick={testConnection} type="button">
        <Bot size={16} />
        Testar conexão
      </Button>
      {result ? <p className="text-sm text-ink/70">{result}</p> : null}
    </div>
  );
}

export function PublishTelegramButton({ offerId, disabled }: { offerId: string; disabled: boolean }) {
  const [result, setResult] = useState<string>("");

  async function publish() {
    setResult("Publicando...");
    const response = await fetch("/api/telegram/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId })
    });
    const payload = (await response.json()) as { ok: boolean; message?: string; messageId?: number };
    setResult(payload.ok ? `Publicado: ${payload.messageId}` : payload.message || "Falha ao publicar.");
  }

  return (
    <div className="grid gap-1">
      <Button disabled={disabled} onClick={publish} type="button">
        <Send size={16} />
        Publicar
      </Button>
      {result ? <p className="text-xs text-ink/60">{result}</p> : null}
    </div>
  );
}
