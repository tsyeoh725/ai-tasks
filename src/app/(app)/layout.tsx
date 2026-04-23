import { Sidebar } from "@/components/sidebar";
import { TopHeader } from "@/components/top-header";
import { AiFloat } from "@/components/ai-float";
import { SidebarProvider } from "@/components/sidebar-context";
import { MobileSidebarBackdrop } from "@/components/mobile-sidebar-backdrop";
import { MobileBottomBar } from "@/components/mobile-bottom-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="relative flex flex-col h-screen isolate">
        {/* Ambient gradient — fixed behind everything */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse at 20% 0%, rgb(30 27 75 / 0.8), transparent 50%), radial-gradient(ellipse at 80% 100%, rgb(76 29 149 / 0.6), transparent 50%), linear-gradient(180deg, rgb(15 23 42) 0%, rgb(2 6 23) 100%)",
          }}
        />
        <TopHeader />
        <div className="flex flex-1 overflow-hidden relative">
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
