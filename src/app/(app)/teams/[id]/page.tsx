"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Member = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
};

type Team = {
  id: string;
  name: string;
  description: string | null;
  role: string;
  members: Member[];
};

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const confirm = useConfirm();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  async function fetchTeam() {
    try {
      const res = await fetch(`/api/teams/${id}`);
      if (res.ok) {
        const data = await res.json();
        setTeam(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTeam();
  }, [id]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");

    if (!inviteEmail.trim()) return;

    const res = await fetch(`/api/teams/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });

    const data = await res.json();

    if (!res.ok) {
      setInviteError(data.error || "Failed to add member");
    } else {
      setInviteSuccess(`${inviteEmail.trim()} has been added to the team`);
      setInviteEmail("");
      fetchTeam();
    }
  }

  async function handleRemoveMember(memberId: string) {
    const ok = await confirm({
      title: "Remove member?",
      description: "They'll lose access to this team's projects and tasks.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;

    await fetch(`/api/teams/${id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });

    fetchTeam();
  }

  async function handleDeleteTeam() {
    const ok = await confirm({
      title: "Delete team?",
      description: `"${team?.name}" and all of its projects and tasks will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete team",
      variant: "destructive",
    });
    if (!ok) return;

    const res = await fetch(`/api/teams/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/teams");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Team not found</p>
      </div>
    );
  }

  const isAdmin = team.role === "owner" || team.role === "admin";
  const roleLabels: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    member: "Member",
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/teams")}>
          <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Teams
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{team.name}</h1>
        {team.description && <p className="text-muted-foreground mt-1">{team.description}</p>}
      </div>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{team.members?.length || 0} member{(team.members?.length || 0) !== 1 ? "s" : ""}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Member List */}
          <div className="space-y-2">
            {team.members?.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                    {member.user.name[0]?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.user.name}</p>
                    <p className="text-xs text-muted-foreground">{member.user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={member.role === "owner" ? "default" : "outline"} className="text-xs">
                    {roleLabels[member.role] || member.role}
                  </Badge>
                  {isAdmin && member.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Invite Form */}
          {isAdmin && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Add Member</h4>
                <form onSubmit={handleInvite} className="flex gap-2">
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value);
                      setInviteError("");
                      setInviteSuccess("");
                    }}
                    placeholder="Enter email address..."
                  />
                  <Button type="submit" disabled={!inviteEmail.trim()}>Add</Button>
                </form>
                {inviteError && (
                  <p className="text-sm text-red-500 mt-2">{inviteError}</p>
                )}
                {inviteSuccess && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-2">{inviteSuccess}</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      {team.role === "owner" && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="text-red-500">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Deleting a team will permanently remove all team projects, tasks, and data. This action cannot be undone.
            </p>
            <Button variant="destructive" onClick={handleDeleteTeam}>Delete Team</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
