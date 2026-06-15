"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { generateQuickPostAction, publishToTelegramAction, publishToInstagramAction, publishToWhatsAppAction } from "@/lib/publish/actions";
import { channels, type Channel } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/field";
import {
  Zap, Send, AlertCircle, CheckCircle2, Loader2,
  Copy, Trash2, ChevronDown, ChevronUp, ImageIcon
} from "lucide-react";

// ─── Types ───
interface PreparedPost {
  id: string;
  url: string;
  productName: string;
  imageUrl: string;
  trackedUrl: string;
  copy: string;
  status: "ready" | "publishing" | "published" | "error";
  publishMessage: string;
  expanded: boolean;
}

// ─── Component ───
export function PublishClient() {
  const [linksInput, setLinksInput] = useState("");
  const [channel, setChannel] = useState<Channel>("telegram");

  // Batch processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0 });
  const [processErrors, setProcessErrors] = useState<string[]>([]);

  // Queue of prepared posts
  const [posts, setPosts] = useState<PreparedPost[]>([]);

  // ─── Parse links from textarea ───
  function parseLinks(text: string): string[] {
    return text
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5 && (l.startsWith("http://") || l.startsWith("https://")));
  }

  // ─── Batch generate ───
  async function handleBatchGenerate(e: React.FormEvent) {
    e.preventDefault();
    const links = parseLinks(linksInput);
    if (links.length === 0) return;

    setIsProcessing(true);
    setProcessProgress({ current: 0, total: links.length });
    setProcessErrors([]);

    const newPosts: PreparedPost[] = [];
    const errors: string[] = [];

    for (let i = 0; i < links.length; i++) {
      setProcessProgress({ current: i + 1, total: links.length });

      try {
        const res = await generateQuickPostAction(links[i], channel);
        if (res.ok && res.copy) {
          newPosts.push({
            id: `post-${Date.now()}-${i}`,
            url: links[i],
            productName: res.offer?.product_name || "Produto",
            imageUrl: res.offer?.image_url || "",
            trackedUrl: res.trackedUrl || "",
            copy: res.copy,
            status: "ready",
            publishMessage: "",
            expanded: i === 0, // Expand first post by default
          });
        } else {
          errors.push(`Link ${i + 1}: ${res.message || "Erro desconhecido"}`);
        }
      } catch (err) {
        errors.push(`Link ${i + 1}: ${err instanceof Error ? err.message : "Erro no servidor"}`);
      }
    }

    setPosts((prev) => [...newPosts, ...prev]);
    setProcessErrors(errors);
    setIsProcessing(false);
    if (newPosts.length > 0) setLinksInput("");
  }

  // ─── Publish single post ───
  const handlePublish = useCallback(async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, status: "publishing" as const, publishMessage: "" } : p))
    );

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    try {
      let res: { ok: boolean; message?: string };

      if (channel === "telegram") {
        res = await publishToTelegramAction(post.copy, post.imageUrl || undefined);
      } else if (channel === "instagram") {
        if (!post.imageUrl) {
          setPosts((prev) =>
            prev.map((p) =>
              p.id === postId
                ? { ...p, status: "error" as const, publishMessage: "Instagram exige imagem. Esse link não tinha imagem." }
                : p
            )
          );
          return;
        }
        res = await publishToInstagramAction(post.copy, post.imageUrl);
      } else if (channel === "whatsapp") {
        res = await publishToWhatsAppAction(post.copy, post.imageUrl || undefined);
      } else {
        await navigator.clipboard.writeText(post.copy);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, status: "published" as const, publishMessage: `Texto copiado! Cole no ${channel.toUpperCase()}.` }
              : p
          )
        );
        return;
      }

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                status: res.ok ? ("published" as const) : ("error" as const),
                publishMessage: res.message || (res.ok ? "Publicado!" : "Falha"),
              }
            : p
        )
      );
    } catch (err) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, status: "error" as const, publishMessage: err instanceof Error ? err.message : "Erro" }
            : p
        )
      );
    }
  }, [posts, channel]);

  // ─── Publish ALL ready posts ───
  async function handlePublishAll() {
    const readyPosts = posts.filter((p) => p.status === "ready");
    for (const post of readyPosts) {
      await handlePublish(post.id);
    }
  }

  // ─── Toggle expand ───
  function toggleExpand(postId: string) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, expanded: !p.expanded } : p))
    );
  }

  // ─── Update copy ───
  function updateCopy(postId: string, newCopy: string) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, copy: newCopy } : p))
    );
  }

  // ─── Remove post ───
  function removePost(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  // ─── Derived state ───
  const parsedCount = parseLinks(linksInput).length;
  const readyCount = posts.filter((p) => p.status === "ready").length;
  const publishedCount = posts.filter((p) => p.status === "published").length;

  return (
    <div className="grid gap-6 min-w-0 w-full max-w-full">
      {/* ─── Input Area ─── */}
      <form onSubmit={handleBatchGenerate} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-[1fr_200px]">
          <Field label={`Links de Afiliado (cole 1 ou vários, um por linha)${parsedCount > 0 ? ` — ${parsedCount} link${parsedCount > 1 ? "s" : ""} detectado${parsedCount > 1 ? "s" : ""}` : ""}`}>
            <textarea
              value={linksInput}
              onChange={(e) => setLinksInput(e.target.value)}
              placeholder={"Cole seus links aqui, um por linha:\nhttps://onelink.shein.com/...\nhttps://s.shopee.com.br/...\nhttps://amzn.to/..."}
              className="glass-input focus-ring w-full max-w-full rounded-lg py-3 px-4 text-sm font-mono resize-none h-[120px] overflow-auto whitespace-pre-wrap break-all"
              style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
              disabled={isProcessing}
            />
          </Field>

          <div className="grid gap-4 content-end">
            <Field label="Canal de destino">
              <Select
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
                disabled={isProcessing}
                className="py-3"
              >
                {channels.map((ch) => (
                  <option key={ch} value={ch}>{ch.toUpperCase()}</option>
                ))}
              </Select>
            </Field>

            <Button
              disabled={isProcessing || parsedCount === 0}
              type="submit"
              variant="gradient"
              className="h-[46px]"
            >
              {isProcessing ? (
                <><Loader2 size={18} className="animate-spin" /> Processando {processProgress.current}/{processProgress.total}...</>
              ) : (
                <><Zap size={18} /> Processar {parsedCount > 1 ? `${parsedCount} Links` : "Link"}</>
              )}
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        {isProcessing && (
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(processProgress.current / processProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-xs text-white/40 text-center">
              Extraindo dados e gerando copy com IA... ({processProgress.current} de {processProgress.total})
            </p>
          </div>
        )}

        {/* Processing Errors */}
        {processErrors.length > 0 && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm space-y-1">
            <p className="font-bold flex items-center gap-1.5"><AlertCircle size={16} /> {processErrors.length} erro(s) no processamento:</p>
            {processErrors.map((err, i) => (
              <p key={i} className="text-xs text-red-400/70 pl-5">• {err}</p>
            ))}
          </div>
        )}
      </form>

      {/* ─── Queue Header ─── */}
      {posts.length > 0 && (
        <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-white/70">
              Fila de Postagens ({posts.length})
            </h2>
            <div className="flex gap-2 text-xs">
              {readyCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {readyCount} pronta{readyCount > 1 ? "s" : ""}
                </span>
              )}
              {publishedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {publishedCount} publicada{publishedCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {readyCount > 1 && (
              <Button variant="gradient" onClick={handlePublishAll} className="text-xs h-8 px-4">
                <Send size={14} />
                Publicar Todas ({readyCount})
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => setPosts([])}
              className="text-xs h-8 px-3 text-white/40 hover:text-red-400"
            >
              <Trash2 size={14} />
              Limpar Fila
            </Button>
          </div>
        </div>
      )}

      {/* ─── Post Queue ─── */}
      <div className="space-y-3 min-w-0 w-full max-w-full">
        {posts.map((post) => (
          <div
            key={post.id}
            className={`overflow-hidden rounded-xl border transition-all duration-200 min-w-0 w-full max-w-full ${
              post.status === "published"
                ? "border-emerald-500/20 bg-emerald-500/[0.03]"
                : post.status === "error"
                ? "border-red-500/20 bg-red-500/[0.03]"
                : post.status === "publishing"
                ? "border-blue-500/30 bg-blue-500/[0.05]"
                : "border-white/[0.05] bg-white/[0.02]"
            }`}
          >
            {/* Post Header (always visible) */}
            <div
              className="flex items-center gap-3 p-4 cursor-pointer select-none min-w-0 w-full max-w-full"
              onClick={() => toggleExpand(post.id)}
            >
              <div className="h-12 w-12 rounded-lg overflow-hidden bg-white/5 flex-shrink-0 flex items-center justify-center">
                {post.imageUrl ? (
                  <div className="relative h-full w-full">
                    <Image 
                      src={post.imageUrl} 
                      alt="" 
                      fill 
                      className="object-cover" 
                      sizes="48px"
                    />
                  </div>
                ) : (
                  <ImageIcon size={20} className="text-white/20" />
                )}
              </div>

              {/* Info — takes remaining space, truncates text */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white/80 truncate">{post.productName}</h3>
                <p className="text-xs text-white/30 truncate">{post.url}</p>
              </div>

              {/* Status Badge + Actions */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                {post.status === "published" && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 size={14} /> Publicado
                  </span>
                )}
                {post.status === "error" && (
                  <span className="flex items-center gap-1 text-xs text-red-400">
                    <AlertCircle size={14} /> Erro
                  </span>
                )}
                {post.status === "publishing" && (
                  <span className="flex items-center gap-1 text-xs text-blue-400">
                    <Loader2 size={14} className="animate-spin" /> Publicando...
                  </span>
                )}
                {post.status === "ready" && (
                  <Button
                    variant="primary"
                    onClick={(e) => { e.stopPropagation(); handlePublish(post.id); }}
                    className="text-xs h-8 px-4 bg-blue-600 hover:bg-blue-500 border-0 whitespace-nowrap"
                  >
                    <Send size={13} />
                    Publicar
                  </Button>
                )}

                {/* Expand toggle */}
                {post.expanded ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
              </div>
            </div>

            {/* Error/Success message */}
            {post.publishMessage && (
              <div className={`mx-4 mb-2 px-3 py-2 rounded-lg text-xs ${
                post.status === "published" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
              }`}>
                {post.publishMessage}
              </div>
            )}

            {/* Expanded Content */}
            {post.expanded && (
              <div className="px-4 pb-4 pt-1 border-t border-white/[0.05] space-y-3 animate-fadeIn">
                {/* Image + Copy side by side on desktop, stacked on mobile */}
                <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-4">
                  {/* Image preview */}
                  {post.imageUrl && (
                    <div className="relative rounded-lg overflow-hidden bg-white/5 border border-white/[0.05] h-[280px] w-full">
                      <Image 
                        src={post.imageUrl} 
                        alt={post.productName} 
                        fill 
                        className="object-contain" 
                        sizes="(max-width: 768px) 100vw, 400px"
                      />
                    </div>
                  )}

                  {/* Copy editor */}
                  <div className="min-w-0 space-y-3">
                    <textarea
                      value={post.copy}
                      onChange={(e) => updateCopy(post.id, e.target.value)}
                      className="glass-input focus-ring w-full max-w-full rounded-lg p-3 text-xs font-mono leading-relaxed resize-none h-[200px] overflow-auto whitespace-pre-wrap break-all"
                      style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                      disabled={post.status === "publishing"}
                    />

                    {/* Action bar */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="ghost"
                        className="text-xs h-7 px-3"
                        onClick={() => {
                          navigator.clipboard.writeText(post.copy);
                        }}
                      >
                        <Copy size={12} /> Copiar
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-xs h-7 px-3 text-red-400/60 hover:text-red-400"
                        onClick={() => removePost(post.id)}
                      >
                        <Trash2 size={12} /> Remover
                      </Button>

                      {/* Spacer pushes publish button to the right */}
                      <div className="flex-1" />

                      {post.status === "ready" && (
                        <Button
                          variant="primary"
                          onClick={() => handlePublish(post.id)}
                          className="text-xs h-8 px-5 bg-blue-600 hover:bg-blue-500 border-0 whitespace-nowrap"
                        >
                          <Send size={13} />
                          Publicar no {channel.toUpperCase()}
                        </Button>
                      )}

                      {post.status === "error" && (
                        <Button
                          variant="primary"
                          onClick={() => {
                            setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, status: "ready" as const, publishMessage: "" } : p));
                          }}
                          className="text-xs h-8 px-5 bg-orange-600 hover:bg-orange-500 border-0 whitespace-nowrap"
                        >
                          Tentar Novamente
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
