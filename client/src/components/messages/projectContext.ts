import { type UserRole } from "../../context/AuthContext";
import { dashboardBase } from "../../lib/dashboardPaths";
import { type ConversationProject } from "./types";

/** Where the provider stands on the project, worded for whoever is reading. */
export const relationLabel = (
  project: ConversationProject,
  viewerRole: UserRole | undefined,
): string => {
  const isClient = viewerRole === "client";
  switch (project.relation) {
    case "hired":
      return isClient ? "Hired" : "You're hired";
    case "bidding":
      return isClient ? "Has bid" : "You bid";
    case "open":
      return "Open brief";
    case "closed":
      return "Closed";
  }
};

/**
 * The page a project link in a chat opens: the brief while an engineer can
 * still bid, the project once they're hired, and the client's bids or project.
 * Null when the viewer can no longer open the project.
 */
export const projectPathFor = (
  project: ConversationProject,
  viewerRole: UserRole | undefined,
): string | null => {
  if (viewerRole === "client") {
    return project.relation === "hired"
      ? `/dashboard/client/projects/${project.id}`
      : `/dashboard/client/bids?project=${project.id}`;
  }
  const base = dashboardBase(viewerRole);
  if (project.relation === "hired") return `${base}/projects/${project.id}`;
  if (project.status === "open_for_bids") return `${base}/marketplace/${project.id}`;
  return null;
};
