"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Approval = {
  id: string;
  taskId: string;
  requestedById: string;
  approverId: string;
  status: "pending" | "approved" | "rejected";
  comment: string | null;
  respondedAt: string | null;
  createdAt: string;
  requestedBy?: { id: string; name: string };
  approver?: { id: string; name: string };
};

type TeamMember = {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string };
};

export function TaskApprovals({
  taskId,
  projectTeamId,
}: {
  taskId: string;
  projectTeamId?: string | null;
}) {
  const [approvalsList, setApprovalsList] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [selectedApproverId, setSelectedApproverId] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseComment, setResponseComment] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/approvals`);
      const data = await res.json();
      setApprovalsList(data.approvals || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // Derive current user id from session
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (data?.user?.id) setCurrentUserId(data.user.id);
      })
      .catch(() => {});
  }, []);

  // Fetch team members when requesting
  useEffect(() => {
    if (!requesting || !projectTeamId) return;
    fetch(`/api/teams/${projectTeamId}`)
      .then((r) => r.json())
      .then((data) => {
        setTeamMembers(data.members || []);
      })
      .catch(() => {});
  }, [requesting, projectTeamId]);

  async function handleRequestApproval() {
    if (!selectedApproverId) return;
    setSubmitting(true);
    try {
      await fetch(`/api/tasks/${taskId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approverId: selectedApproverId }),
      });
      setRequesting(false);
      setSelectedApproverId("");
      fetchApprovals();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRespond(approvalId: string, status: "approved" | "rejected") {
    setSubmitting(true);
    try {
      await fetch(`/api/tasks/${taskId}/approvals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId,
          status,
          comment: responseComment || undefined,
        }),
      });
      setRespondingId(null);
      setResponseComment("");
      fetchApprovals();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  }

  const statusStyles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        Loading approvals...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          Approvals
        </p>
        {!requesting && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRequesting(true)}
          >
            Request Approval
          </Button>
        )}
      </div>

      {/* Request approval form */}
      {requesting && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <p className="text-sm font-medium">Request Approval</p>
          {projectTeamId ? (
            <Select
              value={selectedApproverId}
              onValueChange={(v) => v && setSelectedApproverId(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select approver" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((m) => (
                  <SelectItem key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder="Enter approver user ID"
              value={selectedApproverId}
              onChange={(e) => setSelectedApproverId(e.target.value)}
            />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleRequestApproval}
              disabled={!selectedApproverId || submitting}
            >
              Submit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRequesting(false);
                setSelectedApproverId("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Approvals list */}
      {approvalsList.length === 0 && !requesting && (
        <p className="text-sm text-muted-foreground">No approvals yet.</p>
      )}

      <div className="space-y-2">
        {approvalsList.map((approval) => {
          const isApprover =
            currentUserId && approval.approverId === currentUserId;
          const isPending = approval.status === "pending";

          return (
            <div
              key={approval.id}
              className="border rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                {/* Avatar initial */}
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                  {approval.approver?.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {approval.approver?.name || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requested by {approval.requestedBy?.name || "Unknown"}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyles[approval.status] || ""}`}
                >
                  {approval.status}
                </span>
              </div>

              {approval.comment && (
                <p className="text-sm text-muted-foreground pl-9">
                  {approval.comment}
                </p>
              )}

              <p className="text-xs text-muted-foreground pl-9">
                {new Date(approval.createdAt).toLocaleDateString()}
                {approval.respondedAt &&
                  ` - Responded ${new Date(approval.respondedAt).toLocaleDateString()}`}
              </p>

              {/* Respond buttons for the approver */}
              {isApprover && isPending && (
                <div className="pl-9 space-y-2">
                  {respondingId === approval.id ? (
                    <div className="space-y-2">
                      <Input
                        placeholder="Add a comment (optional)"
                        value={responseComment}
                        onChange={(e) => setResponseComment(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            handleRespond(approval.id, "approved")
                          }
                          disabled={submitting}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            handleRespond(approval.id, "rejected")
                          }
                          disabled={submitting}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRespondingId(null);
                            setResponseComment("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRespondingId(approval.id)}
                    >
                      Respond
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
