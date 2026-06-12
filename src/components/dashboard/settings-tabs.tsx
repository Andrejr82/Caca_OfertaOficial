import Link from "next/link";

const tabs = [
  { id: "general", label: "Geral", href: "/settings" },
  { id: "connection-tests", label: "Testes de Conexão", href: "/settings/connection-tests" },
  { id: "users", label: "Usuários", href: "/settings/users" }
];

export function SettingsTabs({ activeTab }: { activeTab: string }) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/[0.04] bg-white/[0.02] p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
            activeTab === tab.id
              ? "bg-emerald-500/15 text-emerald-400 shadow-sm"
              : "text-white/40 hover:bg-white/[0.04] hover:text-white/60"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
