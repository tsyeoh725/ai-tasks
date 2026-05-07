import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { TopHeader } from "@/components/top-header";
import { AiFloat } from "@/components/ai-float";
import { SidebarProvider } from "@/components/sidebar-context";
import { WorkspaceProvider, type Workspace } from "@/components/workspace-context";
import { MobileSidebarBackdrop } from "@/components/mobile-sidebar-backdrop";
import { MobileBottomBar } from "@/components/mobile-bottom-bar";
import { getSessionUser } from "@/lib/session";
import { db } from "@/db";
import { projects, teamMembers } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Pre-read the workspace cookie so SSR renders with the same workspace the
  // client will hydrate to. Without this, server renders "Personal" and the
  // client flips to a team workspace, triggering React hydration error #418.
  const ws = (await cookies()).get("aitasks_workspace")?.value;
  let initialWorkspace: Workspace =
    ws && ws !== "personal" ? { kind: "team", teamId: ws } : { kind: "personal" };

  // F-01/F-22: if the user has never picked a workspace and has zero personal
  // projects but is a member of one or more teams, default to their first
  // team. Otherwise the sidebar, project picker, and dashboard all sit empty
  // even though the user has data — they just have to find the workspace
  // switcher to see it.
  if (!ws) {
    const user = await getSessionUser();
    if (user) {
      const personalCount = await db.query.projects.findFirst({
        where: and(eq(projects.ownerId, user.id), isNull(projects.teamId)),
        columns: { id: true },
      });
      if (!personalCount) {
        const firstTeam = await db.query.teamMembers.findFirst({
          where: eq(teamMembers.userId, user.id),
          columns: { teamId: true },
        });
        if (firstTeam) {
          initialWorkspace = { kind: "team", teamId: firstTeam.teamId };
        }
      }
    }
  }

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
