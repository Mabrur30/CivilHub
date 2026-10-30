export type RealtimeTopic =
  | "notifications"
  | "conversations"
  | "messages"
  | "bids"
  | "invitations"
  | "projects"
  | "project-progress"
  | "dashboard"
  | "network"
  | "feed"
  | "comments"
  | "equipment-listings"
  | "equipment-availability"
  | "bookings"
  | "reviews"
  | "disputes"
  | "marketplace";

export interface RealtimeScope {
  conversationId?: string;
  projectId?: string;
  bidId?: string;
  equipmentId?: string;
  bookingId?: string;
  postId?: string;
}

export interface RealtimeEvent {
  id: string;
  topics: RealtimeTopic[];
  scope: RealtimeScope;
  createdAt: string;
}
