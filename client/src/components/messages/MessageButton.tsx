import { ChatCircleIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { messageLink } from "../../lib/messages";
import {
  rowButtonClassName,
  secondaryButtonClassName,
} from "../dashboard/ui/buttonStyles";

/** Opens a chat with someone about a project, from a brief, bid or project. */
export function MessageButton({
  userId,
  projectId,
  label,
  size = "row",
}: {
  userId: string;
  projectId?: string | null;
  label: string;
  /** "row" for list rows, "page" beside a page's main action. */
  size?: "row" | "page";
}): ReactElement {
  return (
    <Link
      to={messageLink(userId, projectId)}
      className={size === "page" ? secondaryButtonClassName : rowButtonClassName}
    >
      <ChatCircleIcon aria-hidden="true" className="h-4 w-4" />
      {label}
    </Link>
  );
}
