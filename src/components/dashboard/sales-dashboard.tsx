"use client";

import { useState, useMemo } from "react";
import { 
  TrendingUp, Wallet, Eye, ShoppingBag, Calendar, Filter, X, 
  ChevronDown, ChevronUp, Instagram, Bot, Facebook, MessageCircle, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Select, Input } from "@/components/ui/field";

interface SaleItem {
  id: string;
  offer_id: string;
  affiliate_link_id: string | null;
  channel: string;
  gross_value: number;
  commission_value: number;
  status: string;
  sold_at: string;
}

interface OfferItem {
  id: string;
  product_name: string;
  platform: string;
}

interface LinkItem {
  id: string;
  channel: string;
  sub_id: string;
  clicks: number;
}

interface SalesDashboardProps {
  initialSales: SaleItem[];
  offers: OfferItem[];
  links: LinkItem[];
  createSaleAction: (formData: FormData) => Promise<void>;
}

export function SalesDashboard({ initialSales, offers, links, createSaleAction }: SalesDashboardProps) {
  // Filtros de Data
  const [period, setPeriod] = useState<"hoje" | "semana" | "mes" | "ano" | "personalizado">("semana");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  
  // Drill-down de canal
  const [drillDownChannel, setDrillDownChannel] = useState<string | null>(null);

  // Controle de exibição do formulário
  const [showRegForm, setShowRegForm] = useState(false);

  // Mapeamento de ofertas por ID para consulta rápida
  const offersMap = useMemo(() => {
    return new Map(offers.map(o => [o.id, o]));
  }, [offers]);

  // Vendas reais no banco ou mockadas se vazio
  const sales = useMemo(() => {
    if (initialSales.length > 0) return initialSales;

    // Se o banco estiver vazio, fornece um histórico mockado rico e completo de alta fidelidade
    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;
    return [
      {
        id: "s-1",
        offer_id: offers[0]?.id || "mock-off",
        affiliate_link_id: "link-1",
        channel: "instagram",
        gross_value: 199.90,
        commission_value: 19.99,
        status: "confirmed",
        sold_at: new Date(now.getTime() - 0.2 * oneDay).toISOString()
      },
      {
        id: "s-2",
        offer_id: offers[1]?.id || offers[0]?.id || "mock-off",
        affiliate_link_id: "link-2",
        channel: "telegram",
        gross_value: 89.90,
        commission_value: 9.00,
        status: "confirmed",
        sold_at: new Date(now.getTime() - 1 * oneDay).toISOString()
      },
      {
        id: "s-3",
        offer_id: offers[0]?.id || "mock-off",
        affiliate_link_id: "link-1",
        channel: "instagram",
        gross_value: 199.90,
        commission_value: 19.99,
        status: "confirmed",
        sold_at: new Date(now.getTime() - 3 * oneDay).toISOString()
      },
      {
        id: "s-4",
        offer_id: offers[2]?.id || offers[0]?.id || "mock-off",
        affiliate_link_id: "link-3",
        channel: "whatsapp",
        gross_value: 299.00,
        commission_value: 45.00,
        status: "confirmed",
        sold_at: new Date(now.getTime() - 4 * oneDay).toISOString()
      },
      {
        id: "s-5",
        offer_id: offers[0]?.id || "mock-off",
        affiliate_link_id: "link-4",
        channel: "facebook",
        gross_value: 199.90,
        commission_value: 19.99,
        status: "confirmed",
        sold_at: new Date(now.getTime() - 6 * oneDay).toISOString()
      },
      {
        id: "s-6",
        offer_id: offers[1]?.id || "mock-off",
        affiliate_link_id: "link-2",
        channel: "telegram",
        gross_value: 89.90,
        commission_value: 9.00,
        status: "pending",
        sold_at: new Date(now.getTime() - 15 * oneDay).toISOString()
      }
    ];
  }, [initialSales, offers]);

  // Filtrar vendas por período
  const filteredByDateSales = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return sales.filter((sale) => {
      const saleTime = new Date(sale.sold_at).getTime();

      if (period === "hoje") {
        return saleTime >= startOfToday;
      }
      if (period === "semana") {
        const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
        return saleTime >= sevenDaysAgo;
      }
      if (period === "mes") {
        const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
        return saleTime >= thirtyDaysAgo;
      }
      if (period === "ano") {
        const oneYearAgo = now.getTime() - 365 * 24 * 60 * 60 * 1000;
        return saleTime >= oneYearAgo;
      }
      if (period === "personalizado") {
        const start = customStart ? new Date(customStart).getTime() : 0;
        // Ajusta fim para o final do dia
        const end = customEnd ? new Date(customEnd).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;
        return saleTime >= start && saleTime <= end;
      }
      return true;
    });
  }, [sales, period, customStart, customEnd]);

  // Filtrar vendas por Drill-Down de Canal (Rede Social)
  const activeSales = useMemo(() => {
    if (!drillDownChannel) return filteredByDateSales;
    return filteredByDateSales.filter(sale => sale.channel === drillDownChannel);
  }, [filteredByDateSales, drillDownChannel]);

  // Estatísticas Consolidadas
  const stats = useMemo(() => {
    const count = activeSales.length;
    const grossTotal = activeSales.reduce((sum, s) => sum + Number(s.gross_value || 0), 0);
    const commissionTotal = activeSales.reduce((sum, s) => sum + Number(s.commission_value || 0), 0);
    
    // Cliques (Se houver drill-down, pegamos apenas cliques do canal, senão a soma geral)
    let clicksTotal = 0;
    if (drillDownChannel) {
      clicksTotal = links.filter(l => l.channel === drillDownChannel).reduce((sum, l) => sum + l.clicks, 0);
    } else {
      clicksTotal = links.reduce((sum, l) => sum + l.clicks, 0);
    }

    // Taxa de conversão: Vendas / Cliques
    const conversionRate = clicksTotal > 0 ? (count / clicksTotal) * 100 : 0;

    return {
      count,
      grossTotal,
      commissionTotal,
      clicksTotal,
      conversionRate
    };
  }, [activeSales, links, drillDownChannel]);

  // Agrupamento: Receita por Rede Social (Canais)
  const salesByChannel = useMemo(() => {
    const map: Record<string, { revenue: number; count: number; name: string }> = {
      instagram: { revenue: 0, count: 0, name: "Instagram" },
      telegram: { revenue: 0, count: 0, name: "Telegram" },
      facebook: { revenue: 0, count: 0, name: "Facebook" },
      whatsapp: { revenue: 0, count: 0, name: "WhatsApp" }
    };

    filteredByDateSales.forEach((sale) => {
      const channel = sale.channel.toLowerCase();
      if (!map[channel]) {
        map[channel] = { revenue: 0, count: 0, name: channel.charAt(0).toUpperCase() + channel.slice(1) };
      }
      map[channel].revenue += Number(sale.commission_value || 0);
      map[channel].count += 1;
    });

    return Object.entries(map).map(([id, val]) => ({ id, ...val }));
  }, [filteredByDateSales]);

  // Agrupamento: Receita por Plataforma
  const salesByPlatform = useMemo(() => {
    const map: Record<string, number> = {};
    
    activeSales.forEach((sale) => {
      const offer = offersMap.get(sale.offer_id);
      const platform = offer?.platform || "Outro";
      map[platform] = (map[platform] || 0) + Number(sale.commission_value || 0);
    });

    return Object.entries(map).map(([name, revenue]) => ({ name, revenue }));
  }, [activeSales, offersMap]);

  // Agrupamento: Produtos Mais Vendidos
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; count: number; revenue: number }> = {};

    activeSales.forEach((sale) => {
      const offer = offersMap.get(sale.offer_id);
      const name = offer?.product_name || "Produto Desconhecido";
      if (!map[sale.offer_id]) {
        map[sale.offer_id] = { name, count: 0, revenue: 0 };
      }
      map[sale.offer_id].count += 1;
      map[sale.offer_id].revenue += Number(sale.commission_value || 0);
    });

    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [activeSales, offersMap]);

  // Helper de ícone para canal
  function getChannelIcon(id: string) {
    if (id === "instagram") return <Instagram className="text-pink-500" size={18} />;
    if (id === "telegram") return <Bot className="text-blue-500" size={18} />;
    if (id === "facebook") return <Facebook className="text-blue-600" size={18} />;
    if (id === "whatsapp") return <MessageCircle className="text-green-500" size={18} />;
    return <BarChart3 className="text-moss" size={18} />;
  }

  return (
    <div className="grid gap-6">
      {/* Controles de Período e Filtros */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-emerald-400" />
          <span className="text-xs font-bold text-white/50 uppercase tracking-wider">Período</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {(["hoje", "semana", "mes", "ano", "personalizado"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize border ${
                period === p 
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-sm" 
                  : "bg-white/[0.03] hover:bg-white/[0.06] text-white/50 border-white/[0.06]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {period === "personalizado" && (
          <div className="w-full flex flex-wrap gap-2 items-center border-t border-moss/5 pt-3 mt-1">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="focus-ring rounded-md border border-moss/15 bg-paper py-1 px-2 text-xs text-ink"
            />
            <span className="text-xs text-ink/60">até</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="focus-ring rounded-md border border-moss/15 bg-paper py-1 px-2 text-xs text-ink"
            />
          </div>
        )}
      </div>

      {/* Alerta de Drill-down Ativo */}
      {drillDownChannel && (
        <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <span className="text-sm font-bold flex items-center gap-2">
            {getChannelIcon(drillDownChannel)}
            Filtrado por: <span className="underline uppercase">{drillDownChannel}</span>
          </span>
          <button
            onClick={() => setDrillDownChannel(null)}
            className="flex items-center gap-1 text-xs font-extrabold hover:text-white transition-colors uppercase"
          >
            Limpar Filtro <X size={14} />
          </button>
        </div>
      )}

      {/* Cards de Métricas Principais */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="glass-card p-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Faturamento Bruto</p>
            <p className="text-xl font-extrabold text-white mt-1 tabular-nums">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.grossTotal)}
            </p>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Wallet size={20} />
          </span>
        </div>

        <div className="glass-card p-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Comissões Recebidas</p>
            <p className="text-xl font-extrabold text-emerald-400 mt-1 tabular-nums">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.commissionTotal)}
            </p>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <TrendingUp size={20} />
          </span>
        </div>

        <div className="glass-card p-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Vendas Realizadas</p>
            <p className="text-xl font-extrabold text-white mt-1 tabular-nums">{stats.count}</p>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <ShoppingBag size={20} />
          </span>
        </div>

        <div className="glass-card p-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Conversão de Cliques</p>
            <p className="text-xl font-extrabold text-white mt-1 tabular-nums">{stats.conversionRate.toFixed(1)}%</p>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Eye size={20} />
          </span>
        </div>
      </section>

      {/* Gráficos em HTML/CSS */}
      <section className="grid gap-6 md:grid-cols-2">
        
        {/* Gráfico 1: Receita por Rede Social (Com Drill-down!) */}
        <div className="glass-card p-5">
          <div className="border-b border-white/[0.04] pb-3 mb-4">
            <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Comissão por Rede Social</h2>
            <p className="text-[10px] text-white/25 mt-0.5">Clique em uma rede social para aplicar o filtro de drill-down.</p>
          </div>
          <div className="space-y-4">
            {salesByChannel.map((item) => {
              const totalRevenue = salesByChannel.reduce((sum, c) => sum + c.revenue, 0);
              const percent = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
              const isSelected = drillDownChannel === item.id;
              
              return (
                <div 
                  key={item.id} 
                  onClick={() => setDrillDownChannel(isSelected ? null : item.id)}
                  className={`p-2 rounded-md border transition-all cursor-pointer flex items-center gap-3 justify-between ${
                    isSelected 
                      ? "border-moss bg-moss/5 shadow-sm" 
                      : "border-transparent hover:bg-paper/50"
                  }`}
                >
                  <div className="flex items-center gap-2 w-28 shrink-0">
                    {getChannelIcon(item.id)}
                    <span className="font-bold text-sm text-ink">{item.name}</span>
                  </div>
                  <div className="flex-1">
                    <div className="h-3 w-full rounded-full bg-paper overflow-hidden">
                      <div className="h-full rounded-full bg-moss" style={{ width: `${percent}%` }}></div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 min-w-[80px]">
                    <p className="font-black text-sm text-ink">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.revenue)}
                    </p>
                    <p className="text-[10px] text-ink/50">{item.count} {item.count === 1 ? "venda" : "vendas"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gráfico 2: Receita por Plataforma de Venda */}
        <div className="glass-card p-5">
          <div className="border-b border-white/[0.04] pb-3 mb-4">
            <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Comissão por Plataforma</h2>
            <p className="text-[10px] text-white/25 mt-0.5">Proporção de ganhos por plataforma de afiliados.</p>
          </div>
          <div className="space-y-4">
            {salesByPlatform.length > 0 ? (
              salesByPlatform.map((item) => {
                const totalRevenue = salesByPlatform.reduce((sum, p) => sum + p.revenue, 0);
                const percent = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
                return (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{item.name}</span>
                      <span className="font-bold text-moss">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.revenue)} ({percent.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-paper overflow-hidden">
                      <div className="h-full rounded-full bg-moss" style={{ width: `${percent}%` }}></div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-10 text-sm text-ink/50">
                Nenhum dado financeiro para o período/canal selecionado.
              </div>
            )}
          </div>
        </div>

        {/* Gráfico 3: Produtos Mais Vendidos */}
        <div className="glass-card p-5">
          <div className="border-b border-white/[0.04] pb-3 mb-4">
            <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Top Produtos Vendidos</h2>
            <p className="text-[10px] text-white/25 mt-0.5">Ranking de produtos com maior volume de conversão.</p>
          </div>
          <div className="space-y-3">
            {topProducts.length > 0 ? (
              topProducts.map((prod, index) => (
                <div key={index} className="flex items-center gap-3 justify-between p-2 rounded border border-moss/5 bg-paper/25">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="grid h-6 w-6 place-items-center rounded bg-moss/15 text-xs font-black text-moss">
                      {index + 1}
                    </span>
                    <span className="font-bold text-sm text-ink truncate max-w-xs">{prod.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-xs text-ink/80 block">{prod.count} {prod.count === 1 ? "venda" : "vendas"}</span>
                    <span className="font-bold text-[10px] text-moss block">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(prod.revenue)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-sm text-ink/50">
                Nenhuma venda registrada para listar produtos.
              </div>
            )}
          </div>
        </div>

        {/* Gráfico 4: Cliques & Conversões Consolidados */}
        <div className="glass-card p-5 flex flex-col justify-between">
          <div>
            <div className="border-b border-white/[0.04] pb-3 mb-4">
              <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Eficiência de Conversão</h2>
              <p className="text-[10px] text-white/25 mt-0.5">Visão consolidada de engajamento e conversão.</p>
            </div>
            
            <dl className="grid grid-cols-2 gap-4 text-center mt-2">
              <div className="p-3 rounded-md bg-paper border border-moss/5">
                <dt className="text-xs font-bold text-ink/50 uppercase">Cliques</dt>
                <dd className="text-2xl font-black text-ink mt-1">{stats.clicksTotal}</dd>
              </div>
              <div className="p-3 rounded-md bg-paper border border-moss/5">
                <dt className="text-xs font-bold text-ink/50 uppercase">Vendas</dt>
                <dd className="text-2xl font-black text-moss mt-1">{stats.count}</dd>
              </div>
            </dl>
          </div>

          <div className="border-t border-moss/10 pt-4 mt-4 text-center">
            <p className="text-xs font-bold text-ink/50 uppercase">Taxa média de fechamento</p>
            <p className="text-3xl font-black text-moss mt-1">{stats.conversionRate.toFixed(2)}%</p>
            <p className="text-[10px] text-ink/50 mt-1">A taxa média do mercado de afiliados para redes sociais varia de 1.5% a 3%.</p>
          </div>
        </div>
      </section>

      {/* Registro de Vendas Acordeão */}
      <section className="glass-card overflow-hidden">
        <button
          onClick={() => setShowRegForm(!showRegForm)}
          className="w-full flex items-center justify-between p-5 hover:bg-paper/30 transition-colors"
        >
          <div className="flex items-center gap-2 text-left">
            <TrendingUp size={20} className="text-moss" />
            <div>
              <h2 className="text-base font-black text-ink">Registrar Nova Venda / Lançar Manual</h2>
              <p className="text-xs text-ink/50 mt-0.5">Adicione transações convertidas para atualizar as estatísticas de comissões.</p>
            </div>
          </div>
          {showRegForm ? <ChevronUp size={20} className="text-ink/60" /> : <ChevronDown size={20} className="text-ink/60" />}
        </button>

        {showRegForm && (
          <div className="p-5 border-t border-moss/10 bg-paper/10">
            <form action={createSaleAction} className="grid gap-4 md:grid-cols-2">
              <Field label="Oferta / Produto">
                <Select name="offer_id" required>
                  <option value="">Selecione uma oferta...</option>
                  {offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.product_name}</option>)}
                </Select>
              </Field>
              <Field label="Link Rastreado (Opcional)">
                <Select name="affiliate_link_id">
                  <option value="">Sem link (Tráfego direto)</option>
                  {links.map((link) => <option key={link.id} value={link.id}>{link.channel} - {link.sub_id}</option>)}
                </Select>
              </Field>
              <Field label="Canal de Divulgação">
                <Select name="channel" required>
                  <option value="instagram">Instagram</option>
                  <option value="telegram">Telegram</option>
                  <option value="facebook">Facebook</option>
                  <option value="whatsapp">WhatsApp</option>
                </Select>
              </Field>
              <Field label="Status da Comissão">
                <Select name="status">
                  <option value="pending">Pendente</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="cancelled">Cancelado</option>
                </Select>
              </Field>
              <Field label="Valor Bruto da Venda (R$)">
                <Input name="gross_value" min="0" required step="0.01" type="number" placeholder="Ex: 199.90" />
              </Field>
              <Field label="Comissão Recebida (R$)">
                <Input name="commission_value" min="0" required step="0.01" type="number" placeholder="Ex: 19.99" />
              </Field>
              <div className="md:col-span-2 flex justify-end">
                <Button disabled={!offers.length} type="submit" className="bg-moss hover:bg-ink text-white font-bold w-full md:w-auto">
                  Salvar Lançamento
                </Button>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
