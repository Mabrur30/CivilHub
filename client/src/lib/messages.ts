/**
 * Opens a chat with a user, about a project when one is given. The inbox
 * resolves the user id to the conversation and keeps the project as the
 * thread's context, so either side can message the other from a brief, a bid
 * or a hired project without being connected first.
 */
export const messageLink = (userId: string, projectId?: string | null): string =>
  `/messages/${userId}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`;
