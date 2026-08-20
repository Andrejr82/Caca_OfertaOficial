"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BarChart3, Bot, Link2, MessageSquareText, Settings, ShoppingBag,
  Wallet, Instagram, Facebook, MessageCircle, PanelLeftClose,
  PanelLeftOpen, LogOut, Zap, Menu, Activity, TerminalSquare, Film, Compass, BrainCircuit, Images
} from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { officialBrand } from "@/lib/env";
import { useSidebar } from "./sidebar-provider";

const navSections = [
  {
    title: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
      { href: "/growth", label: "Growth", icon: Activity },
      { href: "/strategy", label: "Estratégia", icon: Compass },
      { href: "/trends", label: "Tendências IA", icon: BrainCircuit }
    ]
  },
  {
    title: "Canais",
    items: [
      { href: "/instagram", label: "Instagram", icon: Instagram },
      { href: "/telegram", label: "Telegram", icon: Bot },
      { href: "/facebook", label: "Facebook", icon: Facebook },
      { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle }
    ]
  },
  {
    title: "Marketing",
    items: [
      { href: "/publish", label: "Publicação Expressa", icon: Zap },
      { href: "/offers", label: "Ofertas", icon: ShoppingBag },
      { href: "/videos", label: "Vídeos de Ofertas", icon: Film },
      { href: "/stories", label: "Stories", icon: Images },
      { href: "/reels", label: "Reels", icon: Film },
      { href: "/tracking", label: "Tracking", icon: Link2 },
      { href: "/sales", label: "Vendas", icon: Wallet }
    ]
  },
  {
    title: "Sistema",
    items: [
      { href: "/history", label: "Histórico do Robô", icon: TerminalSquare },
      { href: "/messages", label: "Mensagens", icon: MessageSquareText },
      { href: "/settings", label: "Configurações", icon: Settings }
    ]
  }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isOpen, toggle } = useSidebar();
  const pathname = usePathname();
  const closeMobileMenu = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches && isOpen) {
      toggle();
    }
  };

  const mobileNav = [
    navSections[0].items[0],
    navSections[1].items[3],
    navSections[2].items[0],
    navSections[2].items[1]
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-base">
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden" onClick={toggle} />
      )}

      <aside className={`glass-sidebar absolute inset-y-0 left-0 z-40 flex flex-col transition-all duration-300 ease-in-out lg:relative ${isOpen ? "translate-x-0 w-[var(--sidebar-width)]" : "-translate-x-full lg:translate-x-0 w-[var(--sidebar-width)] lg:w-[var(--sidebar-collapsed)]"}`}>
        <div className="flex h-16 items-center gap-3 border-b border-white/[0.04] px-4">
          <span className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-[#06131f] shadow-lg shadow-emerald-500/20 ring-1 ring-white/10">
            <Image src="/logo-caca-oferta.png" alt="Logo Caça Oferta Oficial" width={36} height={36} className="h-full w-full object-cover" />
          </span>
          {isOpen && (
            <span className="animate-slideRight overflow-hidden">
              <span className="block text-sm font-extrabold tracking-tight text-white">{officialBrand.appName}</span>
              <span className="block text-[10px] font-medium text-white/40">{officialBrand.instagram}</span>
            </span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {navSections.map((section) => (
            <div key={section.title} className="mb-5">
              {isOpen && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/25">{section.title}</p>}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link href={item.href} prefetch={false} title={!isOpen ? item.label : undefined} className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-all duration-150 ${isActive ? "bg-emerald-500/10 text-emerald-400" : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"}`} onClick={closeMobileMenu}>
                        {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-emerald-400 shadow-lg shadow-emerald-400/30" />}
                        <Icon size={18} className={`flex-shrink-0 transition-colors ${isActive ? "text-emerald-400" : "text-white/35 group-hover:text-white/60"}`} />
                        {isOpen && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/[0.04] p-3 space-y-1">
          <button onClick={toggle} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white/70" title={isOpen ? "Recolher menu" : "Expandir menu"}>
            {isOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            {isOpen && <span>Recolher</span>}
          </button>
          <form action={signOutAction}>
            <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400" title="Sair">
              <LogOut size={18} />
              {isOpen && <span>Sair</span>}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col h-full relative">
        <header className="flex-shrink-0 z-30 flex items-center justify-between border-b border-white/[0.04] px-6" style={{ height: "var(--topbar-height)", background: "rgba(6, 10, 19, 0.75)", backdropFilter: "blur(16px)" }}>
          <div className="flex items-center gap-2 text-sm text-white/40">
            <button onClick={toggle} className="mr-2 -ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-white/70 hover:bg-white/10 lg:hidden" aria-label="Abrir menu">
              <Menu size={18} />
            </button>
            <BarChart3 size={14} className="hidden sm:block" />
            <span className="font-medium hidden sm:inline-block">Caça Oferta</span>
            <span className="text-white/15 hidden sm:inline-block">/</span>
            <span className="font-semibold text-white/70 capitalize">{pathname.split("/").filter(Boolean).pop() || "dashboard"}</span>
          </div>
          <div className="text-xs font-medium text-white/30 tabular-nums">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 pb-24 pt-4 sm:px-6 lg:p-8">{children}</main>

        <nav aria-label="Navegação rápida" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-white/[0.08] bg-[#0c1020]/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-xl lg:hidden">
          {mobileNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} prefetch={false} onClick={closeMobileMenu} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold ${active ? "text-emerald-400" : "text-white/50"}`} aria-current={active ? "page" : undefined}>
                <Icon size={20} aria-hidden="true" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
