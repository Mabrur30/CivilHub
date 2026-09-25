import { type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConversationList } from "../components/messages/ConversationList";
import { InboxEmptyState } from "../components/messages/InboxEmptyState";
import { ThreadView } from "../components/messages/ThreadView";
import { useConversations } from "../components/messages/useConversations";
import { useAuth } from "../context/AuthContext";

// One page for /messages and /messages/:targetId. On large screens the list
// and the open thread sit side by side; on small screens the URL decides which
// of the two fills the panel.
export function InboxPage(): ReactElement {
  const { targetId } = useParams<{ targetId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const inbox = useConversations();

  const networkPath =
    currentUser?.role === "engineer"
      ? "/dashboard/engineer/network"
      : "/dashboard/client/network";

  return (
    <>
      <h1 className="sr-only">Messages</h1>
      <section className="relative flex h-[calc(100dvh-12rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-white/10 bg-surface lg:h-[calc(100dvh-13rem)] lg:min-h-[36rem]">
        <div
          className={`${targetId ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col lg:w-80 lg:border-r lg:border-white/10`}
        >
          <ConversationList
            inbox={inbox}
            selectedId={targetId ?? null}
            currentUserId={currentUser?.id}
            networkPath={networkPath}
            onSelect={(conversationId) =>
              navigate(`/messages/${conversationId}`)
            }
          />
        </div>

        <div
          className={`${targetId ? "flex" : "hidden lg:flex"} min-w-0 flex-1`}
        >
          {targetId ? (
            <ThreadView
              key={targetId}
              targetId={targetId}
              currentUser={currentUser}
              inbox={inbox}
              onBack={() => navigate("/messages")}
            />
          ) : (
            <InboxEmptyState />
          )}
        </div>
      </section>
    </>
  );
}
