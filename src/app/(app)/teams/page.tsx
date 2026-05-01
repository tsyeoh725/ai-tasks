"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TeamMember = {
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
  members: TeamMember[];
};

export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");

  async function fetchTeams() {
    try {
      const res = await fetch("/api/teams");
      const data = await res.json();
      setTeams(data.teams || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTeams();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTeamName.trim(), description: newTeamDesc.trim() || null }),
    });

    if (res.ok) {
      setNewTeamName("");
      setNewTeamDesc("");
      setCreating(false);
      fetchTeams();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-muted-foreground text-sm">Manage your teams and members</p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Team
          </Button>
        )}
      </div>

      {/* Create Team Form */}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Create Team</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team-name">Team Name</Label>
                <Input
                  id="team-name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g., Engineering"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-desc">Description (optional)</Label>
                <Input
                  id="team-desc"
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="What does this team do?"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!newTeamName.trim()}>Create</Button>
                <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Teams List */}
      {teams.length === 0 && !creating ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground mb-4">You&apos;re not part of any teams yet.</p>
            <Button onClick={() => setCreating(true)}>Create Your First Team</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => (
            <Card
              key={team.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => router.push(`/teams/${team.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{team.name}</h3>
                    {team.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{team.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {team.members?.length || 0} member{(team.members?.length || 0) !== 1 ? "s" : ""} &middot; You&apos;re {team.role === "owner" ? "the owner" : team.role === "admin" ? "an admin" : "a member"}
                    </p>
                  </div>
                  <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
