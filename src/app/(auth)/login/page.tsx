import { AlertCircle, Mail, Lock } from "lucide-react";
import Image from "next/image";
import { signInAction } from "@/lib/auth/actions";
import { officialBrand, hasSupabasePublicEnv } from "@/lib/env";
import { Button } from "@/components/ui/button";

export default async function LoginPage(props: { searchParams: Promise<{ error?: string }> }) {
  const searchParams = await props.searchParams;
  const configured = hasSupabasePublicEnv();
  const error = searchParams?.error;

  return (
    <main
      className="grid min-h-screen place-items-center px-4 py-10 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #060a13 0%, #0c1020 40%, #060a13 100%)"
      }}
    >
      {/* Animated background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-20 blur-[120px]"
          style={{
            background: "radial-gradient(circle, #10b981, transparent)",
            animation: "bgShift 12s ease-in-out infinite"
          }}
        />
        <div
          className="absolute -right-32 -bottom-32 h-96 w-96 rounded-full opacity-15 blur-[120px]"
          style={{
            background: "radial-gradient(circle, #38bdf8, transparent)",
            animation: "bgShift 15s ease-in-out infinite reverse"
          }}
        />
        <div
          className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full opacity-10 blur-[100px]"
          style={{
            background: "radial-gradient(circle, #fbbf24, transparent)",
            animation: "bgShift 10s ease-in-out infinite"
          }}
        />
      </div>

      {/* Login Card */}
      <section
        className="relative z-10 w-full max-w-md animate-slideUp"
        style={{
          background: "linear-gradient(135deg, rgba(17, 24, 39, 0.6), rgba(12, 16, 32, 0.8))",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(16, 185, 129, 0.06)"
        }}
      >
        <div className="p-8">
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 h-20 w-20 overflow-hidden rounded-2xl bg-[#06131f] shadow-xl shadow-emerald-500/25 ring-1 ring-white/10">
              <Image
                src="/logo-caca-oferta.png"
                alt="Logo Caça Oferta Oficial"
                width={80}
                height={80}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-white">
              {officialBrand.appName}
            </h1>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-white/35">
              <Lock size={10} />
              Acesso seguro ao painel operacional
            </p>
          </div>

          {/* Config Warning */}
          {!configured ? (
            <div className="mb-5 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-sm text-amber-300">
              <AlertCircle className="mt-0.5 shrink-0" size={16} />
              <span className="text-xs">
                Configure <code className="text-amber-200">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
                <code className="text-amber-200">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para ativar o login.
              </span>
            </div>
          ) : null}

          {/* Error */}
          {error && error !== "supabase-env" ? (
            <p className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {decodeURIComponent(error)}
            </p>
          ) : null}

          {/* Form */}
          <form action={signInAction} className="grid gap-5">
            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-white/35">E-mail</span>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-white/20">
                  <Mail size={16} />
                </span>
                <input
                  autoComplete="email"
                  name="email"
                  required
                  type="email"
                  placeholder="seu@email.com"
                  className="glass-input focus-ring w-full rounded-xl py-3 pl-10 pr-4 text-sm"
                />
              </div>
            </label>
            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-white/35">Senha</span>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-white/20">
                  <Lock size={16} />
                </span>
                <input
                  autoComplete="current-password"
                  name="password"
                  required
                  type="password"
                  placeholder="••••••••"
                  className="glass-input focus-ring w-full rounded-xl py-3 pl-10 pr-4 text-sm"
                />
              </div>
            </label>
            <Button disabled={!configured} type="submit" variant="gradient" className="mt-2 w-full py-3 text-sm font-bold">
              Entrar
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
