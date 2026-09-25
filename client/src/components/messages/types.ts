import {
  isMessageAttachment,
  type MessageAttachment,
  type MessageType,
} from "../../lib/messageAttachments";

export interface Participant {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
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
}

export interface OptimisticMessage extends ChatMessage {
  isPending?: boolean;
}

export interface GetMessagesResponse {
  conversationId: string;
  otherParticipant: Participant | null;
  messages: ChatMessage[];
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
}

export type InboxFilter = "all" | "unread" | "starred" | "archived";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isParticipant = (value: unknown): value is Participant =>
  isRecord(value) &&
  typeof value.userId === "string" &&
  typeof value.name === "string" &&
  (value.role === "client" || value.role === "engineer") &&
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
  };
};

export const conversationActivityTime = (
  conversation: ConversationSummary,
): number =>
  new Date(
    conversation.lastMessage?.createdAt ?? conversation.updatedAt,
  ).getTime();
