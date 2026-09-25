import { CheckIcon } from "@phosphor-icons/react";
import { type ReactElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  primaryButtonClassName,
  rowButtonClassName,
} from "../ui/buttonStyles";
import { Dialog } from "../ui/Dialog";
import { getErrorMessage } from "./clientData";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

interface InviteProject {
  id: string;
  title: string;
  status: string;
  canInvite: boolean;
  invitation: { status: "pending" | "accepted" | "declined" } | null;
}

const isInviteProject = (value: unknown): value is InviteProject => {
  if (typeof value !== "object" || value === null) return false;
  const project = value as Record<string, unknown>;
  const invitation = project.invitation as Record<string, unknown> | null;
  return (
    typeof project.id === "string" &&
    typeof project.title === "string" &&
    typeof project.status === "string" &&
    typeof project.canInvite === "boolean" &&
    (invitation === null ||
      (typeof invitation === "object" &&
        (invitation.status === "pending" ||
          invitation.status === "accepted" ||
          invitation.status === "declined")))
  );
};

const invitationLabels: Record<"pending" | "accepted" | "declined", string> = {
  pending: "Invited",
  accepted: "Accepted, bid on its way",
  declined: "Declined your invite",
};

interface InviteToBidDialogProps {
  engineerId: string;
  engineerName: string;
  onClose: () => void;
}

// Lets a client invite an engineer straight from the directory, instead of
// opening the profile first. Only briefs still taking bids can be picked.
export function InviteToBidDialog({
  engineerId,
  engineerName,
  onClose,
}: InviteToBidDialogProps): ReactElement {
  const [projects, setProjects] = useState<InviteProject[] | null>(null);
  const [loadError, setLoadError] = useState<string>("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/bid-invitations/client/engineers/${engineerId}/projects`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
        const list =
          typeof body === "object" && body !== null
            ? (body as { projects?: unknown }).projects
            : undefined;
        if (!response.ok || !Array.isArray(list) || !list.every(isInviteProject)) {
          setLoadError(getErrorMessage(body, "Unable to load your briefs."));
          return;
        }
        setProjects(list.filter((project) => project.status === "open_for_bids"));
      } catch {
        setLoadError("Unable to connect to CivilHub. Please try again.");
      }
    };
    void load();
  }, [engineerId]);

  const invite = async (projectId: string): Promise<void> => {
    setSendingId(projectId);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/bid-invitations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, engineerId }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(getErrorMessage(body, "Unable to send the invitation."));
        return;
      }
      setProjects((current) =>
        current?.map((project) =>
          project.id === projectId
            ? { ...project, canInvite: false, invitation: { status: "pending" } }
            : project,
        ) ?? null,
      );
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Dialog
      title={`Invite ${engineerName} to bid`}
      description="They get a notification and can send you a bid on the brief."
      onClose={onClose}
      isBusy={sendingId !== null}
    >
      {loadError ? (
        <p role="alert" className="text-sm text-red-300">
          {loadError}
        </p>
      ) : projects === null ? (
        <p className="text-sm text-white/55">Loading your briefs...</p>
      ) : projects.length === 0 ? (
        <div>
          <p className="text-sm leading-6 text-white/65">
            You have no briefs taking bids. Post one, then invite{" "}
            {engineerName.split(" ")[0]} to it.
          </p>
          <Link to="/dashboard/client/post-project" className={`${primaryButtonClassName} mt-5`}>
            Post a project
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
          {projects.map((project) => (
            <li key={project.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <span className="min-w-0 truncate font-semibold text-white/90">
                {project.title}
              </span>
              {project.invitation ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-white/55">
                  <CheckIcon className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                  {invitationLabels[project.invitation.status]}
                </span>
              ) : project.canInvite ? (
                <button
                  type="button"
                  onClick={() => void invite(project.id)}
                  disabled={sendingId !== null}
                  className={rowButtonClassName}
                >
                  {sendingId === project.id ? "Inviting..." : "Invite"}
                </button>
              ) : (
                <span className="shrink-0 text-sm text-white/45">Can't invite</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
