import { Sidebar } from "@/components/sidebar";
import { TopHeader } from "@/components/top-header";
import { AiFloat } from "@/components/ai-float";
import { SidebarProvider } from "@/components/sidebar-context";
import { MobileSidebarBackdrop } from "@/components/mobile-sidebar-backdrop";
import { MobileBottomBar } from "@/components/mobile-bottom-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="relative flex flex-col h-screen bg-slate-50 dark:bg-[#0a0e0a]">
        <TopHeader />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <MobileSidebarBackdrop />
          <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 pb-16 md:pb-0">
            {children}
          </main>
        </div>
        <MobileBottomBar />
        <AiFloat />
      </div>
    </SidebarProvider>
  );
}
