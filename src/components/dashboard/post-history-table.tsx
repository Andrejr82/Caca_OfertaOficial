"use client";

import { useState, useMemo } from "react";
import { Search, ArrowUpDown, ExternalLink, Calendar, Eye, ShoppingCart, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PostItem {
  id: string;
  date: string;
  time: string;
  product: string;
  platform: string;
  link: string;
  channel: string;
  status: string;
  clicks: number;
  conversions: number;
  revenue: number;
}

interface PostHistoryTableProps {
  initialData: PostItem[];
  channelName: string;
}

export function PostHistoryTable({ initialData, channelName }: PostHistoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<"date" | "clicks" | "conversions" | "revenue">("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Dados mockados de demonstração caso o banco de dados esteja inteiramente vazio
  const displayData = useMemo(() => {
    if (initialData.length > 0) return initialData;

    // Gerar dados mockados realistas para o canal correspondente
    return [
      {
        id: "mock-1",
        date: "09/06/2026",
        time: "08:15",
        product: "Fone de Ouvido Bluetooth JBL Tune 510BT",
        platform: "Amazon",
        link: "https://amazon.com.br/dp/mock-jbl",
        channel: channelName,
        status: "published",
        clicks: 142,
        conversions: 8,
        revenue: 239.20
      },
      {
        id: "mock-2",
        date: "08/06/2026",
        time: "17:30",
        product: "Smartwatch Xiaomi Redmi Watch 3 Active",
        platform: "Shopee",
        link: "https://shopee.com.br/mock-redmi-watch",
        channel: channelName,
        status: "published",
        clicks: 98,
        conversions: 5,
        revenue: 149.50
      },
      {
        id: "mock-3",
        date: "07/06/2026",
        time: "11:20",
        product: "Smartphone Samsung Galaxy A54 5G",
        platform: "Mercado Livre",
        link: "https://mercadolivre.com.br/mock-galaxy-a54",
        channel: channelName,
        status: "draft",
        clicks: 0,
        conversions: 0,
        revenue: 0.00
      },
      {
        id: "mock-4",
        date: "06/06/2026",
        time: "14:10",
        product: "Robô Aspirador de Pó Kabum Smart 500",
        platform: "Magalu",
        link: "https://magalu.com.br/mock-aspirador",
        channel: channelName,
        status: "failed",
        clicks: 0,
        conversions: 0,
        revenue: 0.00
      },
      {
        id: "mock-5",
        date: "05/06/2026",
        time: "09:45",
        product: "Vestido Feminino Elegante Manga Bufante",
        platform: "Outro", // representando Shein
        link: "https://shein.com.br/mock-vestido",
        channel: channelName,
        status: "published",
        clicks: 220,
        conversions: 15,
        revenue: 119.85
      }
    ].filter(item => item.channel === channelName);
  }, [initialData, channelName]);

  // Extrai todas as plataformas únicas disponíveis para o filtro
  const platforms = useMemo(() => {
    const list = new Set(displayData.map(item => item.platform));
    return ["all", ...Array.from(list)];
  }, [displayData]);

  // Manipular ordenação
  function handleSort(field: "date" | "clicks" | "conversions" | "revenue") {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  // Filtrar e pesquisar dados
  const filteredData = useMemo(() => {
    return displayData
      .filter(item => {
        const matchesSearch = item.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.platform.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPlatform = platformFilter === "all" || item.platform === platformFilter;
        const matchesStatus = statusFilter === "all" || item.status === statusFilter;
        return matchesSearch && matchesPlatform && matchesStatus;
      })
      .sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];

        if (sortField === "date") {
          // Converte DD/MM/AAAA + HH:MM para timestamp
          const parseDate = (dStr: string, tStr: string) => {
            const [day, month, year] = dStr.split("/").map(Number);
            const [hour, minute] = tStr.split(":").map(Number);
            return new Date(year, month - 1, day, hour, minute).getTime();
          };
          valA = parseDate(a.date, a.time);
          valB = parseDate(b.date, b.time);
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [displayData, searchTerm, platformFilter, statusFilter, sortField, sortAsc]);

  return (
    <div className="glass-card p-5">
      <div className="border-b border-white/[0.04] pb-4 mb-4">
        <h2 className="text-sm font-bold text-white/70 uppercase tracking-[0.08em]">Histórico de Postagens</h2>
        <p className="text-xs text-white/35 mt-1">Lista completa de divulgações realizadas e rascunhos para este canal.</p>
      </div>

      {/* Controles de Filtro e Busca */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-ink/40">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Pesquisar produto ou plataforma..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="glass-input focus-ring w-full rounded-lg py-2.5 pl-9 pr-4 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="focus-ring rounded-md border border-moss/10 bg-paper py-2 px-3 text-sm text-ink font-semibold focus:border-moss"
          >
            <option value="all">Todas as Plataformas</option>
            {platforms.filter(p => p !== "all").map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="focus-ring rounded-md border border-moss/10 bg-paper py-2 px-3 text-sm text-ink font-semibold focus:border-moss"
          >
            <option value="all">Todos os Status</option>
            <option value="published">Publicado</option>
            <option value="draft">Rascunho</option>
            <option value="failed">Falhou</option>
          </select>
        </div>
      </div>

      {/* Tabela de Histórico */}
      <div className="overflow-x-auto rounded-lg border border-white/[0.04]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-paper border-b border-moss/10 text-xs font-black uppercase tracking-wider text-ink/60">
              <th className="py-3 px-4 cursor-pointer hover:bg-moss/5" onClick={() => handleSort("date")}>
                <span className="flex items-center gap-1">
                  Data/Hora
                  <ArrowUpDown size={12} />
                </span>
              </th>
              <th className="py-3 px-4">Produto</th>
              <th className="py-3 px-4">Plataforma</th>
              <th className="py-3 px-4">Link</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 cursor-pointer hover:bg-moss/5 text-center" onClick={() => handleSort("clicks")}>
                <span className="flex items-center justify-center gap-1">
                  Cliques
                  <ArrowUpDown size={12} />
                </span>
              </th>
              <th className="py-3 px-4 cursor-pointer hover:bg-moss/5 text-center" onClick={() => handleSort("conversions")}>
                <span className="flex items-center justify-center gap-1">
                  Conversões
                  <ArrowUpDown size={12} />
                </span>
              </th>
              <th className="py-3 px-4 cursor-pointer hover:bg-moss/5 text-right" onClick={() => handleSort("revenue")}>
                <span className="flex items-center justify-end gap-1">
                  Receita
                  <ArrowUpDown size={12} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-moss/10 text-sm">
            {filteredData.length > 0 ? (
              filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-paper/50">
                  <td className="py-3 px-4 font-semibold text-ink/80 whitespace-nowrap">
                    <span className="block text-xs font-bold text-ink">{item.date}</span>
                    <span className="block text-[10px] text-ink/40">{item.time}</span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-ink max-w-xs truncate" title={item.product}>
                    {item.product}
                  </td>
                  <td className="py-3 px-4">
                    <Badge label={item.platform} />
                  </td>
                  <td className="py-3 px-4">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-moss hover:underline font-bold"
                    >
                      Ver Link
                      <ExternalLink size={10} />
                    </a>
                  </td>
                  <td className="py-3 px-4">
                    <Badge
                      label={item.status === "published" ? "Publicado" : item.status === "draft" ? "Rascunho" : "Falhou"}
                      tone={item.status === "published" ? "good" : item.status === "draft" ? "future" : "warn"}
                    />
                  </td>
                  <td className="py-3 px-4 text-center font-bold text-ink/80">{item.clicks}</td>
                  <td className="py-3 px-4 text-center font-bold text-ink/80">{item.conversions}</td>
                  <td className="py-3 px-4 text-right font-black text-moss">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.revenue)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="py-8 text-center text-ink/50 bg-paper/20">
                  Nenhuma postagem encontrada para os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sumário rápido das métricas exibidas */}
      {filteredData.length > 0 && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg border border-white/[0.04] bg-white/[0.02] text-xs">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-ink/60" />
            <div>
              <p className="text-ink/60 font-semibold">Postagens</p>
              <p className="font-bold text-ink text-sm">{filteredData.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-ink/60" />
            <div>
              <p className="text-ink/60 font-semibold">Cliques Totais</p>
              <p className="font-bold text-ink text-sm">{filteredData.reduce((acc, curr) => acc + curr.clicks, 0)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ShoppingCart size={14} className="text-ink/60" />
            <div>
              <p className="text-ink/60 font-semibold">Conversões</p>
              <p className="font-bold text-ink text-sm">{filteredData.reduce((acc, curr) => acc + curr.conversions, 0)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign size={14} className="text-moss" />
            <div>
              <p className="text-moss font-bold">Comissão Total</p>
              <p className="font-black text-moss text-sm">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                  filteredData.reduce((acc, curr) => acc + curr.revenue, 0)
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
