import {
  isMessageAttachment,
  type MessageAttachment,
  type MessageType,
} from "../../lib/messageAttachments";

export interface Participant {
  userId: string;
  name: string;
  role: "client" | "engineer" | "organisation";
  profilePhotoUrl: string | null;
  /** Verified by CivilHub (engineers and companies). */
  verified?: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  messageType: MessageType;
  content: string;
  attachment: MessageAttachment | null;
  createdAt: string;
  sender: Participant;
  isReadByRequester: boolean;
  /** The project the message was about, when sent from a project's context. */
  projectId?: string | null;
  /** Phone numbers or emails were hidden because the pair hadn't hired yet. */
  contactHidden?: boolean;
}

/** Where the provider in a conversation stands on a project. */
export type ProjectRelation = "open" | "bidding" | "hired" | "closed";

/** A project the two people in a conversation have talked about. */
export interface ConversationProject {
  id: string;
  title: string;
  status: string;
  relation: ProjectRelation;
}

export interface OptimisticMessage extends ChatMessage {
  isPending?: boolean;
}

export interface GetMessagesResponse {
  conversationId: string;
  otherParticipant: Participant | null;
  messages: ChatMessage[];
  /** Newest context first; missing from older servers. */
  projects?: unknown;
  contactsHidden?: boolean;
  /** More messages remain before this page; missing from older servers. */
  hasMore?: boolean;
}

export interface CreateConversationResponse {
  id: string;
  participants: string[];
  lastMessageAt: string | null;
}

export interface ConversationPreviewMessage {
  id: string;
  content: string;
  messageType?: MessageType;
  attachmentName?: string | null;
  durationSeconds?: number | null;
  createdAt: string;
  senderId: string;
}

export interface ConversationSummary {
  id: string;
  otherParticipant: Participant;
  lastMessage: ConversationPreviewMessage | null;
  unreadCount: number;
  isStarred: boolean;
  isArchived: boolean;
  updatedAt: string;
  projects: ConversationProject[];
  /** Contact details are masked until this pair has a hire together. */
  contactsHidden: boolean;
}

export type InboxFilter = "all" | "unread" | "starred" | "archived";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const RELATIONS: ProjectRelation[] = ["open", "bidding", "hired", "closed"];

/** Reads a conversation's projects leniently; anything malformed is dropped. */
export const toConversationProjects = (value: unknown): ConversationProject[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is ConversationProject =>
          isRecord(item) &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.status === "string" &&
          RELATIONS.includes(item.relation as ProjectRelation),
      )
    : [];

export const isParticipant = (value: unknown): value is Participant =>
  isRecord(value) &&
  typeof value.userId === "string" &&
  typeof value.name === "string" &&
  (value.role === "client" || value.role === "engineer" || value.role === "organisation") &&
  (typeof value.profilePhotoUrl === "string" || value.profilePhotoUrl === null);

export const isMessage = (value: unknown): value is ChatMessage =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.conversationId === "string" &&
  (value.messageType === "text" ||
    value.messageType === "file" ||
    value.messageType === "audio") &&
  typeof value.content === "string" &&
  (value.attachment === null || isMessageAttachment(value.attachment)) &&
  typeof value.createdAt === "string" &&
  isParticipant(value.sender) &&
  typeof value.isReadByRequester === "boolean";

export const isGetMessagesResponse = (
  value: unknown,
): value is GetMessagesResponse =>
  isRecord(value) &&
  typeof value.conversationId === "string" &&
  (value.otherParticipant === null || isParticipant(value.otherParticipant)) &&
  Array.isArray(value.messages) &&
  value.messages.every(isMessage);

export const isCreateConversationResponse = (
  value: unknown,
): value is CreateConversationResponse =>
  isRecord(value) &&
  typeof value.id === "string" &&
  Array.isArray(value.participants) &&
  value.participants.every((item) => typeof item === "string") &&
  (typeof value.lastMessageAt === "string" || value.lastMessageAt === null);

const isPreviewMessage = (
  value: unknown,
): value is ConversationPreviewMessage =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.content === "string" &&
  typeof value.createdAt === "string" &&
  typeof value.senderId === "string";

// The inbox flags are read leniently so a list from an older server (without
// them) still renders, just with nothing starred or archived.
export const toConversationSummary = (
  value: unknown,
): ConversationSummary | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isParticipant(value.otherParticipant) ||
    !(value.lastMessage === null || isPreviewMessage(value.lastMessage)) ||
    typeof value.unreadCount !== "number" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    otherParticipant: value.otherParticipant,
    lastMessage: value.lastMessage,
    unreadCount: value.unreadCount,
    isStarred: value.isStarred === true,
    isArchived: value.isArchived === true,
    updatedAt: value.updatedAt,
    projects: toConversationProjects(value.projects),
    contactsHidden: value.contactsHidden === true,
  };
};

export const conversationActivityTime = (
  conversation: ConversationSummary,
): number =>
  new Date(
    conversation.lastMessage?.createdAt ?? conversation.updatedAt,
  ).getTime();
