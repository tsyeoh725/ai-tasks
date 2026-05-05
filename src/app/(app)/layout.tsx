import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { TopHeader } from "@/components/top-header";
import { AiFloat } from "@/components/ai-float";
import { SidebarProvider } from "@/components/sidebar-context";
import { WorkspaceProvider, type Workspace } from "@/components/workspace-context";
import { MobileSidebarBackdrop } from "@/components/mobile-sidebar-backdrop";
import { MobileBottomBar } from "@/components/mobile-bottom-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Pre-read the workspace cookie so SSR renders with the same workspace the
  // client will hydrate to. Without this, server renders "Personal" and the
  // client flips to a team workspace, triggering React hydration error #418.
  const ws = (await cookies()).get("aitasks_workspace")?.value;
  const initialWorkspace: Workspace =
    ws && ws !== "personal" ? { kind: "team", teamId: ws } : { kind: "personal" };

  return (
    <WorkspaceProvider initialWorkspace={initialWorkspace}>
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
    </WorkspaceProvider>
  );
}
