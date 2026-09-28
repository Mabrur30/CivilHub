import { type OptimisticMessage, type Participant } from "./types";

// Messages from the same person within this window share one header row.
const GROUP_GAP_MS = 5 * 60 * 1000;

export type ThreadItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "project"; key: string; title: string }
  | {
      kind: "group";
      key: string;
      sender: Participant;
      isMine: boolean;
      messages: OptimisticMessage[];
    };

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const dayLabel = (date: Date): string => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return "Today";
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
};

/**
 * Splits a sorted thread into day dividers and runs of one sender's messages.
 * When a pair talks about more than one project, a divider marks where the
 * conversation moves to another project.
 */
export const groupMessages = (
  messages: OptimisticMessage[],
  currentUserId: string | undefined,
  projectTitles: Map<string, string> = new Map(),
): ThreadItem[] => {
  const items: ThreadItem[] = [];
  const markProjects = projectTitles.size > 1;
  let lastProject: string | null = null;
  let lastDay = "";
  let current: Extract<ThreadItem, { kind: "group" }> | null = null;
  let lastTime = 0;

  for (const message of messages) {
    const date = new Date(message.createdAt);
    const key = dayKey(date);
    if (key !== lastDay) {
      items.push({ kind: "day", key: `day-${key}`, label: dayLabel(date) });
      lastDay = key;
      current = null;
    }

    const projectTitle = message.projectId
      ? projectTitles.get(message.projectId)
      : undefined;
    if (markProjects && projectTitle && message.projectId !== lastProject) {
      items.push({
        kind: "project",
        key: `project-${message.id}`,
        title: projectTitle,
      });
      lastProject = message.projectId ?? null;
      current = null;
    }

    const time = date.getTime();
    if (
      current &&
      current.sender.userId === message.sender.userId &&
      time - lastTime <= GROUP_GAP_MS
    ) {
      current.messages.push(message);
    } else {
      current = {
        kind: "group",
        key: `group-${message.id}`,
        sender: message.sender,
        isMine: message.sender.userId === currentUserId,
        messages: [message],
      };
      items.push(current);
    }
    lastTime = time;
  }

  return items;
};
