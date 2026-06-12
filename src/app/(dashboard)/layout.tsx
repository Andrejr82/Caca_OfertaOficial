import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { ToastProvider } from "@/components/ui/toast-context";
import { RealtimeNotificationListener } from "@/components/dashboard/realtime-notification-listener";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirect("/login");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Read sidebar state from cookie (server-side) to prevent flicker
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("sidebar:state")?.value;
  const defaultOpen = sidebarCookie !== "false"; // default to open

  return (
    <ToastProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppShell>{children}</AppShell>
      </SidebarProvider>
      <RealtimeNotificationListener />
    </ToastProvider>
  );
}
