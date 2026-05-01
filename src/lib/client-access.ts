import { db } from "@/db";
import { clients, teamMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/** Returns true if userId can read/write the given client. */
export async function canAccessClient(clientId: string, userId: string): Promise<boolean> {
  const client = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
    columns: { ownerId: true, teamId: true },
  });
  if (!client) return false;
  if (client.ownerId === userId) return true;
  if (client.teamId) {
    const m = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, client.teamId), eq(teamMembers.userId, userId)),
      columns: { id: true },
    });
    return !!m;
  }
  return false;
}
