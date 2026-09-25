import {
  type ChatMessage,
  type ConversationSummary,
  type GetMessagesResponse,
  isCreateConversationResponse,
  isGetMessagesResponse,
  isMessage,
  toConversationSummary,
} from "./types";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export const CONNECTION_ERROR =
  "Unable to connect to CivilHub. Please try again.";

export const getErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "object" && value !== null) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const fetchConversations = async (): Promise<
  Result<ConversationSummary[]>
> => {
  const response = await fetch(`${API_BASE_URL}/api/conversations`, {
    credentials: "include",
  });
  const body = await readJson(response);

  if (!response.ok || !Array.isArray(body)) {
    return {
      ok: false,
      error: getErrorMessage(body, "Unable to load conversations."),
    };
  }

  const summaries = body.map(toConversationSummary);
  if (summaries.some((summary) => summary === null)) {
    return { ok: false, error: "Unable to load conversations." };
  }
  return { ok: true, data: summaries as ConversationSummary[] };
};

export type FetchMessagesResult =
  | { status: "ok"; data: GetMessagesResponse }
  | { status: "not_found" }
  | { status: "forbidden"; error: string };

export const fetchMessages = async (
  conversationId: string,
): Promise<FetchMessagesResult> => {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}/messages`,
    { credentials: "include" },
  );
  const body = await readJson(response);

  if (response.ok && isGetMessagesResponse(body)) {
    return { status: "ok", data: body };
  }
  if (response.status === 404 || response.status === 400) {
    return { status: "not_found" };
  }
  return {
    status: "forbidden",
    error: getErrorMessage(
      body,
      response.status === 403
        ? "You cannot access this conversation."
        : "Unable to load this conversation.",
    ),
  };
};

export const resolveConversationWithUser = async (
  userId: string,
): Promise<Result<string>> => {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/with/${userId}`,
    { credentials: "include" },
  );
  const body = await readJson(response);

  if (!response.ok || !isCreateConversationResponse(body)) {
    return {
      ok: false,
      error: getErrorMessage(
        body,
        "Unable to start a conversation with this user.",
      ),
    };
  }
  return { ok: true, data: body.id };
};

export const sendTextMessage = async (
  conversationId: string,
  content: string,
): Promise<Result<ChatMessage>> => {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content }),
    },
  );
  const body = await readJson(response);

  if (!response.ok || !isMessage(body)) {
    return {
      ok: false,
      error: getErrorMessage(body, "Unable to send message."),
    };
  }
  return { ok: true, data: body };
};

export const setConversationFlags = async (
  conversationId: string,
  flags: { starred?: boolean; archived?: boolean },
): Promise<boolean> => {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(flags),
    },
  );
  return response.ok;
};

export const markConversationRead = async (
  conversationId: string,
): Promise<boolean> => {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}/read`,
    { method: "PATCH", credentials: "include" },
  );
  return response.ok;
};
