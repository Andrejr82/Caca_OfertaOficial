"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { generateQuickPostAction, publishToTelegramAction, publishToInstagramAction, publishToWhatsAppAction } from "@/lib/publish/actions";
import { PRODUCT_IMAGE_RENDER_VERSION } from "@/lib/images/render-version";
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
  copies?: { telegram: string; whatsapp: string; instagram: string; facebook: string; };
  status: "ready" | "confirming" | "publishing" | "published" | "error" | "partial_error";
  publishMessage: string;
  expanded: boolean;
  offerId?: string;
  targetChannels: string[];
  platform?: string;
}

// ─── Subcomponents ───
function PremiumImagePreview({ offerId, productName }: { offerId?: string; productName: string }) {
  const [loading, setLoading] = useState(true);
  if (!offerId) return null;
  return (
    <div className="relative rounded-lg overflow-hidden bg-black/40 border border-white/[0.05] flex items-center justify-center min-h-[320px]">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-emerald-500" size={28} />
          <span className="text-xs text-white/50 font-medium">Renderizando Imagem Premium...</span>
        </div>
      )}
      <img
        src={`/api/images/whatsapp-premium?offerId=${encodeURIComponent(offerId)}&v=${PRODUCT_IMAGE_RENDER_VERSION}`}
        alt={productName}
        className={`object-contain w-full h-full transition-opacity duration-500 ${loading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setLoading(false)}
        onError={() => setLoading(false)}
      />
    </div>
  );
}

// ─── Component ───
export function PublishClient({ initialUrl = "" }: { initialUrl?: string }) {
  const [linksInput, setLinksInput] = useState(initialUrl);
  const [channel, setChannel] = useState<Channel | "omnichannel">("omnichannel");

  // Batch processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0 });
  const [processErrors, setProcessErrors] = useState<string[]>([]);
  const [processSummary, setProcessSummary] = useState<{ total: number; success: number; failed: number } | null>(null);

  // Queue of prepared posts
  const [posts, setPosts] = useState<PreparedPost[]>([]);

  // ─── Parse links from textarea ───
  function parseLinks(text: string): string[] {
    return text
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5 && (l.startsWith("http://") || l.startsWith("https://")));
  }

  // ─── Batch generate com isolamento por item (MAX_CONCURRENCY=3) ───
  async function handleBatchGenerate(e: React.FormEvent) {
    e.preventDefault();
    const links = parseLinks(linksInput);
    if (links.length === 0) return;

    const MAX_CONCURRENCY = 3;
    setIsProcessing(true);
    setProcessProgress({ current: 0, total: links.length });
    setProcessErrors([]);
    setProcessSummary(null);

    // Reservar posições na ordem original
    const newPosts: (PreparedPost | null)[] = new Array(links.length).fill(null);
    const errors: string[] = [];
    let completed = 0;

    // Processar em lotes de MAX_CONCURRENCY — falha de um não cancela os demais
    for (let batchStart = 0; batchStart < links.length; batchStart += MAX_CONCURRENCY) {
      const batch = links.slice(batchStart, batchStart + MAX_CONCURRENCY);

      const batchResults = await Promise.allSettled(
        batch.map((link, batchIdx) =>
          generateQuickPostAction(link, channel).then((res) => ({ res, index: batchStart + batchIdx }))
        )
      );

      for (let ri = 0; ri < batchResults.length; ri++) {
        const settled = batchResults[ri];
        const globalIndex = batchStart + ri;
        completed++;
        setProcessProgress({ current: completed, total: links.length });

        if (settled.status === "fulfilled") {
          const { res, index } = settled.value;
          if (res.ok && res.copy && res.offer) {
            newPosts[index] = {
              id: `post-${Date.now()}-${index}`,
              url: links[index],
              productName: res.offer?.product_name || "Produto",
              imageUrl: res.offer?.image_url || "",
              trackedUrl: res.trackedUrl || (res as any).affiliateUrl || "",
              copy: res.copy,
              copies: res.copies,
              targetChannels: channel === "omnichannel" ? ["telegram", "whatsapp", "facebook", "instagram"] : [channel],
              status: "ready",
              publishMessage: "",
              expanded: index === 0,
              offerId: res.offer.id,
              platform: res.offer?.platform,
            };
          } else {
            errors.push(`Link ${globalIndex + 1}: ${res.message || "Erro desconhecido"}`);
          }
        } else {
          errors.push(
            `Link ${globalIndex + 1}: ${settled.reason instanceof Error ? settled.reason.message : "Erro no servidor"}`
          );
        }
      }
    }

    const validPosts = newPosts.filter(Boolean) as PreparedPost[];
    setPosts((prev) => [...validPosts, ...prev]);
    setProcessErrors(errors);
    setProcessSummary({ total: links.length, success: validPosts.length, failed: errors.length });
    setIsProcessing(false);
    if (validPosts.length > 0) setLinksInput("");
  }

  // ─── Publish single post ───
  const handlePublish = useCallback(async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, status: "publishing" as const, publishMessage: "" } : p))
    );

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    try {
      let results = [];
      for (const ch of post.targetChannels) {
        const copyToUse = post.copies ? (post.copies as any)[ch] : post.copy;

        if (ch === "telegram") {
          results.push(await publishToTelegramAction(copyToUse, post.imageUrl || undefined));
        } else if (ch === "instagram") {
          if (!post.imageUrl) {
            results.push({ ok: false, message: "Instagram exige imagem. Pulado." });
          } else {
            results.push(await publishToInstagramAction(copyToUse, post.imageUrl, post.offerId));
          }
        } else if (ch === "whatsapp") {
          results.push(await publishToWhatsAppAction(copyToUse, post.imageUrl || undefined));
        }
      }

      const allOk = results.every(r => r.ok);
      const someOk = results.some(r => r.ok);
      const msg = results.map(r => r.message).join(" | ");

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                status: allOk ? ("published" as const) : someOk ? ("partial_error" as const) : ("error" as const),
                publishMessage: msg || (allOk ? "Publicado em todos!" : "Falha geral"),
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
  }, [posts]);

  // ─── Preview state transition ───
  function handlePreview(postId: string) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, status: "confirming" as const } : p))
    );
  }

  function cancelPreview(postId: string) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, status: "ready" as const } : p))
    );
  }

  // ─── Publish ALL ready posts ───
  async function handlePublishAll() {
    void posts.filter((p) => p.status === "ready");
    setPosts((prev) =>
      prev.map((p) => (p.status === "ready" ? { ...p, status: "confirming" as const, expanded: true } : p))
    );
  }

  // ─── Toggle expand ───
  function toggleExpand(postId: string) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, expanded: !p.expanded } : p))
    );
  }

  // ─── Update copy ───
  function updateCopy(postId: string, newCopy: string, targetChannel?: string) {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        if (targetChannel && p.copies) {
          return { ...p, copies: { ...p.copies, [targetChannel]: newCopy } };
        }
        return { ...p, copy: newCopy };
      })
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
              placeholder={"Cole seus links aqui, um por linha:\nhttps://s.shopee.com.br/codigo-afiliado\nhttps://shopee.com.br/produto-i.loja.item\nhttps://meli.la/..."}
              className="glass-input focus-ring w-full max-w-full rounded-lg py-3 px-4 text-sm font-mono resize-none h-[120px] overflow-auto whitespace-pre-wrap break-all"
              style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
              disabled={isProcessing}
            />
            <p className="mt-1 text-xs text-white/40">Shopee: aceitamos o link curto de afiliado ou a URL normal de um produto individual.</p>
          </Field>

          <div className="grid gap-4 content-end">
            <Field label="Canal de destino">
              <Select
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel | "omnichannel")}
                disabled={isProcessing}
                className="py-3"
              >
                <option value="omnichannel">🔥 Omnichannel (Simultâneo)</option>
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

        {/* Processing Summary */}
        {processSummary && !isProcessing && (
          <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            processSummary.failed === 0
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              : processSummary.success === 0
              ? "bg-red-500/10 border border-red-500/20 text-red-400"
              : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
          }`}>
            {processSummary.failed === 0
              ? <CheckCircle2 size={14} />
              : <AlertCircle size={14} />}
            <span>
              {processSummary.total} link{processSummary.total > 1 ? "s" : ""} processado{processSummary.total > 1 ? "s" : ""} —{" "}
              {processSummary.success} confirmado{processSummary.success !== 1 ? "s" : ""},{" "}
              {processSummary.failed} falha{processSummary.failed !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Processing Errors (individual) */}
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
                Pré-visualizar Todas ({readyCount})
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
                : post.status === "confirming"
                ? "border-amber-500/30 bg-amber-500/[0.05]"
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
                  <div className="relative h-full w-full flex items-center justify-center">
                    <img
                      src={`/api/images/proxy?url=${encodeURIComponent(post.imageUrl)}`} referrerPolicy="no-referrer"
                      alt=""
                      className="object-cover w-full h-full"
                    />
                  </div>
                ) : (
                  <ImageIcon size={20} className="text-white/20" />
                )}
              </div>

              {/* Info */}
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
                {post.status === "confirming" && (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <CheckCircle2 size={14} /> Aguardando Confirmação
                  </span>
                )}
                {post.status === "ready" && (
                  <Button
                    variant="primary"
                    onClick={(e) => { e.stopPropagation(); handlePreview(post.id); }}
                    className="text-xs h-8 px-4 bg-blue-600 hover:bg-blue-500 border-0 whitespace-nowrap"
                  >
                    <Send size={13} />
                    Pré-visualizar
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
                {post.status === "confirming" ? (
                  /* ─── CONFIRMATION MOCKUP ─── */
                  <div className="bg-[#0b141a] border border-white/[0.05] rounded-xl p-4 max-w-md mx-auto space-y-2 shadow-2xl relative mt-4">
                    {/* Badges */}
                    <div className="absolute -top-3 left-4 flex gap-2">
                      {post.platform && <Badge label={post.platform} tone="neutral" />}
                      <Badge label="Premium Template" tone="good" />
                    </div>

                    {/* Fake WhatsApp Bubble */}
                    <div className="bg-[#005c4b] rounded-xl rounded-tr-none p-1 shadow-sm relative">
                      {/* Triangle tail */}
                      <div className="absolute top-0 -right-2 w-0 h-0 border-t-[10px] border-t-[#005c4b] border-r-[10px] border-r-transparent"></div>

                      {/* Image */}
                      {post.targetChannels.includes("whatsapp") ? (
                        <PremiumImagePreview offerId={post.offerId} productName={post.productName} />
                      ) : (
                        <div className="relative rounded-lg overflow-hidden bg-black/20 flex items-center justify-center min-h-[200px]">
                          <img src={`/api/images/proxy?url=${encodeURIComponent(post.imageUrl)}`} className="object-contain w-full h-full p-2" alt={post.productName} />
                        </div>
                      )}

                      {/* Text */}
                      <div className="px-2 pt-2 pb-1 text-[14px] text-white/95 whitespace-pre-wrap font-sans leading-relaxed break-words">
                        {post.targetChannels.length > 1 && post.copies ? (post.copies as any)["whatsapp"] : post.copy}
                      </div>

                      {/* Time */}
                      <div className="text-[10px] text-white/60 text-right px-2 pb-1 flex justify-end items-center gap-1">
                        12:00 <CheckCircle2 size={10} className="text-blue-400" />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4">
                      <Button variant="ghost" onClick={() => cancelPreview(post.id)} className="flex-1 text-xs h-10 border border-white/10 hover:bg-white/5">
                        Voltar e Editar
                      </Button>
                      <Button variant="primary" onClick={() => handlePublish(post.id)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-xs text-white border-0 h-10">
                        <Send size={14} className="mr-2" /> Confirmar Envio
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ─── EDIT FORM ─── */
                  <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-4">
                    {/* Image preview */}
                    {post.imageUrl && (
                      <div className="relative rounded-lg overflow-hidden bg-white/5 border border-white/[0.05] h-[280px] w-full flex items-center justify-center">
                        <img
                          src={`/api/images/proxy?url=${encodeURIComponent(post.imageUrl)}`} referrerPolicy="no-referrer"
                          alt={post.productName}
                          className="object-contain w-full h-full p-2"
                        />
                      </div>
                    )}

                    {/* Copy editor */}
                    <div className="min-w-0 space-y-3">

                      {/* Alerta Semi-Automático Shein */}
                      {post.url.includes("shein.com") && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                          <AlertCircle className="text-amber-500 mt-0.5 flex-shrink-0" size={16} />
                          <div className="text-xs text-amber-500/90 leading-relaxed">
                            <strong>Ação Manual Necessária:</strong> Este é um produto da Shein. Pegue o link que está no texto abaixo, abra no <strong>App Oficial da Shein</strong> para gerar seu link curto de afiliado e cole no lugar do link longo antes de clicar em Publicar!
                          </div>
                        </div>
                      )}

                      {post.targetChannels.length > 1 && post.copies ? (
                        <div className="grid gap-3">
                          {post.targetChannels.map((ch) => (
                            <div key={ch} className="space-y-1">
                              <div className="text-[10px] text-white/50 font-bold uppercase">{ch}</div>
                              <textarea
                                value={(post.copies as any)[ch]}
                                onChange={(e) => updateCopy(post.id, e.target.value, ch)}
                                className="glass-input focus-ring w-full max-w-full rounded-lg p-3 text-xs font-mono leading-relaxed resize-none h-[120px] overflow-auto whitespace-pre-wrap break-all"
                                style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                                disabled={post.status === "publishing"}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          value={post.copy}
                          onChange={(e) => updateCopy(post.id, e.target.value)}
                          className="glass-input focus-ring w-full max-w-full rounded-lg p-3 text-xs font-mono leading-relaxed resize-none h-[200px] overflow-auto whitespace-pre-wrap break-all"
                          style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                          disabled={post.status === "publishing"}
                        />
                      )}

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

                        {/* Spacer */}
                        <div className="flex-1" />

                        {post.status === "ready" && (
                          <Button
                            variant="primary"
                            onClick={() => handlePreview(post.id)}
                            className="text-xs h-8 px-5 bg-blue-600 hover:bg-blue-500 border-0 whitespace-nowrap"
                          >
                            <Send size={13} />
                            Pré-visualizar Publicação
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
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
