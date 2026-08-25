import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  formatRelativeTime,
  getNotificationDotClassName,
  isNotificationListResponse,
  type NotificationListItem,
  type NotificationListResponse,
} from "./notificationUtils";

interface TopNavAlertsProps {
  role: "client" | "engineer";
}

interface ConversationUnreadSummary {
  unreadCount: number;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const POLL_MS = 9000;
const DROPDOWN_LIMIT = 8;

const isConversationUnreadSummary = (
  value: unknown,
): value is ConversationUnreadSummary => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const summary = value as Record<string, unknown>;
  return typeof summary.unreadCount === "number";
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") {
      return body.message;
    }
  }

  return "Unable to load notifications.";
};

const getNotificationTargetPath = (
  notification: NotificationListItem,
  role: "client" | "engineer",
): string | null => {
  if (notification.type === "new_message" && notification.conversationId) {
    return `/messages/${notification.conversationId}`;
  }

  if (
    (notification.type === "bid_accepted" ||
      notification.type === "bid_declined" ||
      notification.type === "project_phase_updated") &&
    notification.projectId
  ) {
    return `/dashboard/${role}/projects/${notification.projectId}`;
  }

  if (notification.type === "connection_accepted") {
    return `/dashboard/${role}/network`;
  }

  if (
    notification.type === "connection_post" ||
    notification.type === "post_liked"
  ) {
    return "/feed";
  }

  return null;
};

const MessageIcon = (): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 4V6z" />
  </svg>
);

const BellIcon = (): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
    <path d="M10 17a2 2 0 0 0 4 0" />
  </svg>
);

const renderIconBadge = (count: number): ReactElement | null => {
  if (count <= 0) {
    return null;
  }

  if (count > 99) {
    return (
      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary" />
    );
  }

  return (
    <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
      {count}
    </span>
  );
};

export function TopNavAlerts({ role }: TopNavAlertsProps): ReactElement {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [messageUnreadCount, setMessageUnreadCount] = useState<number>(0);
  const [notificationUnreadCount, setNotificationUnreadCount] =
    useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationListItem[]>(
    [],
  );
  const [isLoadingNotifications, setIsLoadingNotifications] =
    useState<boolean>(false);
  const [notificationsError, setNotificationsError] = useState<string>("");

  const unreadNotificationIds = useMemo(
    () =>
      new Set(
        notifications
          .filter((notification) => !notification.isRead)
          .map((n) => n.id),
      ),
    [notifications],
  );

  const loadMessageUnreadCount = async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/conversations`, {
      credentials: "include",
    });
    const body: unknown = await response.json();

    if (!response.ok || !Array.isArray(body)) {
      return;
    }

    const totalUnread = body
      .filter(isConversationUnreadSummary)
      .reduce((sum, item) => sum + item.unreadCount, 0);

    setMessageUnreadCount(totalUnread);
  };

  const loadNotifications = async (options?: {
    silent?: boolean;
    limit?: number;
    page?: number;
  }): Promise<NotificationListResponse | null> => {
    const silent = options?.silent ?? false;
    const page = options?.page ?? 1;
    const limit = options?.limit ?? DROPDOWN_LIMIT;

    if (!silent) {
      setIsLoadingNotifications(true);
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/notifications?page=${page}&limit=${limit}`,
        {
          credentials: "include",
        },
      );
      const body: unknown = await response.json();

      if (!response.ok || !isNotificationListResponse(body)) {
        if (!silent) {
          setNotificationsError(getErrorMessage(body));
        }
        return null;
      }

      setNotifications(body.items);
      setNotificationUnreadCount(body.unreadCount);
      setNotificationsError("");
      return body;
    } catch {
      if (!silent) {
        setNotificationsError(
          "Unable to connect to CivilHub. Please try again.",
        );
      }
      return null;
    } finally {
      if (!silent) {
        setIsLoadingNotifications(false);
      }
    }
  };

  const refreshCounts = async (): Promise<void> => {
    await Promise.all([
      loadMessageUnreadCount(),
      loadNotifications({ silent: true, limit: DROPDOWN_LIMIT }),
    ]);
  };

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      await refreshCounts();
    };

    void bootstrap();

    const intervalId = window.setInterval(() => {
      void refreshCounts();
    }, POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent): void => {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleToggleNotifications = (): void => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen) {
      void loadNotifications();
    }
  };

  const markSingleRead = async (notificationId: string): Promise<void> => {
    await fetch(`${API_BASE_URL}/api/notifications/${notificationId}/read`, {
      method: "PATCH",
      credentials: "include",
    });
  };

  const handleNotificationClick = async (
    notification: NotificationListItem,
  ): Promise<void> => {
    const wasUnread = unreadNotificationIds.has(notification.id);

    if (wasUnread) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      );
      setNotificationUnreadCount((current) => Math.max(0, current - 1));
      void markSingleRead(notification.id);
    }

    const targetPath = getNotificationTargetPath(notification, role);
    if (targetPath) {
      setIsOpen(false);
      navigate(targetPath);
    }
  };

  const handleMarkAllRead = async (): Promise<void> => {
    setNotifications((current) =>
      current.map((item) => ({ ...item, isRead: true })),
    );
    setNotificationUnreadCount(0);

    try {
      await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
        method: "PATCH",
        credentials: "include",
      });
    } finally {
      void loadNotifications({ silent: true, limit: DROPDOWN_LIMIT });
    }
  };

  return (
    <div className="flex items-center gap-2" ref={menuRef}>
      <Link
        to="/messages"
        aria-label="Messages"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-primary hover:text-white"
      >
        <MessageIcon />
        {renderIconBadge(messageUnreadCount)}
      </Link>

      <div className="relative">
        <button
          type="button"
          aria-label="Notifications"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={handleToggleNotifications}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-primary hover:text-white"
        >
          <BellIcon />
          {renderIconBadge(notificationUnreadCount)}
        </button>

        <div
          role="menu"
          aria-hidden={!isOpen}
          className={`absolute right-0 top-full z-50 mt-3 w-88 origin-top-right rounded-2xl border border-white/10 bg-surface p-2 shadow-2xl transition-all duration-150 ${
            isOpen
              ? "scale-100 opacity-100"
              : "pointer-events-none scale-95 opacity-0"
          }`}
        >
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <p className="text-sm font-semibold text-white">Notifications</p>
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={notificationUnreadCount === 0}
              className="text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all as read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoadingNotifications ? (
              <div
                className="space-y-2 px-2 py-2"
                aria-label="Loading notifications"
              >
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`notification-skeleton-${index}`}
                    className="animate-pulse rounded-xl border border-white/10 bg-void/40 p-3"
                  >
                    <div className="h-3 w-2/3 rounded bg-white/10" />
                    <div className="mt-2 h-2.5 w-1/3 rounded bg-white/10" />
                  </div>
                ))}
              </div>
            ) : notificationsError ? (
              <div className="px-2 py-3">
                <p className="rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-xs text-red-200">
                  {notificationsError}
                </p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-2 py-6 text-center">
                <p className="text-sm text-white/60">No notifications yet.</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const isUnread = !notification.isRead;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    role="menuitem"
                    onClick={() => void handleNotificationClick(notification)}
                    className={`mb-1.5 block w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      isUnread
                        ? "border-primary/25 bg-primary/8 hover:border-primary/45"
                        : "border-white/10 bg-void/45 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getNotificationDotClassName(notification.type)}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white/85">
                          {notification.message}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[11px] text-white/45">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                          {isUnread ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-white/10 px-2 pb-1 pt-2 text-right">
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-primary"
            >
              View all
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
