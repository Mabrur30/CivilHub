import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  formatRelativeTime,
  getNotificationDotClassName,
  isNotificationListResponse,
  type NotificationListItem,
  type NotificationListResponse,
} from "../components/dashboard/notificationUtils";

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const PAGE_LIMIT = 20;

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
      notification.type === "project_phase_updated" ||
      notification.type === "phase_plan_submitted" ||
      notification.type === "phase_plan_approved" ||
      notification.type === "phase_plan_rejected" ||
      notification.type === "advance_payment_received" ||
      notification.type === "phase_payment_received" ||
      notification.type === "full_payment_received" ||
      notification.type === "review_received" ||
      notification.type === "review_reply") &&
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

export function NotificationsPage(): ReactElement {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationListItem[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_LIMIT)),
    [total],
  );

  const loadNotifications = async (nextPage: number): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/notifications?page=${nextPage}&limit=${PAGE_LIMIT}`,
        {
          credentials: "include",
        },
      );
      const body: unknown = await response.json();

      if (!response.ok || !isNotificationListResponse(body)) {
        setError(getErrorMessage(body));
        return;
      }

      const payload = body as NotificationListResponse;
      setNotifications(payload.items);
      setUnreadCount(payload.unreadCount);
      setTotal(payload.total);
      setPage(payload.page);
      setError("");
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications(1);
  }, []);

  const markSingleRead = async (notificationId: string): Promise<void> => {
    await fetch(`${API_BASE_URL}/api/notifications/${notificationId}/read`, {
      method: "PATCH",
      credentials: "include",
    });
  };

  const handleNotificationClick = async (
    notification: NotificationListItem,
  ): Promise<void> => {
    if (!notification.isRead) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      void markSingleRead(notification.id);
    }

    if (!currentUser) {
      return;
    }

    const target = getNotificationTargetPath(notification, currentUser.role);
    if (target) {
      navigate(target);
    }
  };

  const handleMarkAllRead = async (): Promise<void> => {
    setNotifications((current) =>
      current.map((item) => ({ ...item, isRead: true })),
    );
    setUnreadCount(0);

    try {
      await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
        method: "PATCH",
        credentials: "include",
      });
    } finally {
      void loadNotifications(page);
    }
  };

  return (
    <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
              Activity
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-white sm:text-4xl">
              Notifications
            </h1>
            <p className="mt-2 text-sm text-white/60">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                : "All caught up"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadNotifications(page)}
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 hover:border-primary hover:text-white"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={unreadCount === 0}
              className="rounded-full border border-primary/50 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all as read
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-3" aria-label="Loading notifications">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`notification-skeleton-${index}`}
                className="animate-pulse rounded-xl border border-white/10 bg-void/40 p-4"
              >
                <div className="h-4 w-2/3 rounded bg-white/10" />
                <div className="mt-3 h-3 w-1/3 rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div
            className="mt-6 rounded-xl border border-red-400/25 bg-red-400/10 p-4"
            role="alert"
          >
            <p className="text-sm text-red-200">{error}</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-void/40 p-8 text-center">
            <h2 className="font-heading text-2xl font-bold text-white">
              No notifications yet
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/60">
              Activity from bids, messages, connections, and feed updates will
              appear here.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => void handleNotificationClick(notification)}
                className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                  notification.isRead
                    ? "border-white/10 bg-void/45 hover:border-white/20"
                    : "border-primary/25 bg-primary/8 hover:border-primary/45"
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
                      <span className="text-xs text-white/45">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                      {!notification.isRead ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {!isLoading && !error && totalPages > 1 ? (
          <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => void loadNotifications(page - 1)}
              disabled={page <= 1}
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 hover:border-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <p className="text-xs text-white/55">
              Page {page} of {totalPages}
            </p>
            <button
              type="button"
              onClick={() => void loadNotifications(page + 1)}
              disabled={page >= totalPages}
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 hover:border-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
