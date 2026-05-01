"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Collaborator = {
  id: string;
  role: string;
  userId: string;
  userName: string;
  userEmail: string;
};

type TeamMember = {
  userId: string;
  name: string;
  email: string;
};

const roleBadgeColors: Record<string, string> = {
  assignee: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  reviewer: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  follower: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export function TaskCollaborators({
  taskId,
  projectTeamId,
}: {
  taskId: string;
  projectTeamId?: string | null;
}) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("follower");
  const [loading, setLoading] = useState(false);

  const fetchCollaborators = useCallback(() => {
    fetch(`/api/tasks/${taskId}/collaborators`)
      .then((r) => r.json())
      .then((data) => setCollaborators(data.collaborators || []))
      .catch(() => {});
  }, [taskId]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  useEffect(() => {
    if (showAdd && projectTeamId) {
      fetch(`/api/teams/${projectTeamId}`)
        .then((r) => r.json())
        .then((data) => {
          const members = (data.members || []).map(
            (m: { userId: string; user?: { name: string; email: string } }) => ({
              userId: m.userId,
              name: m.user?.name || "Unknown",
              email: m.user?.email || "",
            })
          );
          setTeamMembers(members);
        })
        .catch(() => {});
    }
  }, [showAdd, projectTeamId]);

  async function addCollaborator() {
    if (!selectedUserId || !selectedRole) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
      });
      if (res.ok) {
        fetchCollaborators();
        setShowAdd(false);
        setSelectedUserId("");
        setSelectedRole("follower");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function removeCollaborator(collaboratorId: string) {
    try {
      await fetch(`/api/tasks/${taskId}/collaborators`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collaboratorId }),
      });
      fetchCollaborators();
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Collaborators</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? "Cancel" : "Add Collaborator"}
        </Button>
      </div>

      {/* Collaborator list */}
      <div className="space-y-2">
        {collaborators.map((collab) => (
          <div
            key={collab.id}
            className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-accent"
          >
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium flex-shrink-0">
              {collab.userName[0]?.toUpperCase() || "?"}
            </div>
            <span className="text-sm truncate flex-1">{collab.userName}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${roleBadgeColors[collab.role] || roleBadgeColors.follower}`}
            >
              {collab.role}
            </span>
            <button
              onClick={() => removeCollaborator(collab.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              title="Remove"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}
        {collaborators.length === 0 && (
          <p className="text-xs text-muted-foreground px-2">
            No collaborators yet
          </p>
        )}
      </div>

      {/* Add collaborator form */}
      {showAdd && (
        <div className="border rounded-md p-3 space-y-3">
          {projectTeamId ? (
            <Select
              onValueChange={(v: string | null) => {
                if (v) setSelectedUserId(v);
              }}
              value={selectedUserId || undefined}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">
              This task is not associated with a team project. Add the project
              to a team to see team members here.
            </p>
          )}

          <Select
            onValueChange={(v: string | null) => {
              if (v) setSelectedRole(v);
            }}
            value={selectedRole}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="assignee">Assignee</SelectItem>
              <SelectItem value="reviewer">Reviewer</SelectItem>
              <SelectItem value="follower">Follower</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            onClick={addCollaborator}
            disabled={!selectedUserId || loading}
          >
            {loading ? "Adding..." : "Add"}
          </Button>
        </div>
      )}
    </div>
  );
}
