import { Types } from "mongoose";
import { Bid } from "../models/Bid.model";
import { BidInvitation } from "../models/BidInvitation.model";
import { type IProject, Project } from "../models/Project.model";
import { type UserRole } from "../models/User.model";
import { isProviderRole } from "./roles";

/**
 * Rules for messages about a project. A client and an engineer or company
 * can talk about a project before and after a hire without being connected,
 * but until they have hired each other their phone numbers and emails are
 * masked, so the deal and its payment stay on CivilHub.
 */

export interface ChatUser {
  id: string;
  role: UserRole;
}

export type ProjectRelation = "open" | "bidding" | "hired" | "closed";

export interface ConversationProjectView {
  id: string;
  title: string;
  status: IProject["status"];
  /** Where the provider in this conversation stands on the project. */
  relation: ProjectRelation;
}

interface ContactError extends Error {
  statusCode: number;
}

const contactError = (message: string, statusCode: number): ContactError => {
  const error = new Error(message) as ContactError;
  error.statusCode = statusCode;
  return error;
};

/** Splits a pair into the client and the provider, or null for other pairs. */
export const clientAndProvider = (
  a: ChatUser,
  b: ChatUser,
): { client: ChatUser; provider: ChatUser } | null => {
  if (a.role === "client" && isProviderRole(b.role)) return { client: a, provider: b };
  if (b.role === "client" && isProviderRole(a.role)) return { client: b, provider: a };
  return null;
};

/**
 * Loads a project the two users may talk about: one is its client and the
 * other a provider who could bid on it, has bid, was invited, or was hired.
 */
export const loadDiscussableProject = async (
  projectId: string,
  a: ChatUser,
  b: ChatUser,
): Promise<IProject> => {
  const denied = contactError("You can only message about a project you're part of", 403);
  if (!Types.ObjectId.isValid(projectId)) throw denied;
  const pair = clientAndProvider(a, b);
  if (!pair) throw denied;

  const project = await Project.findById(projectId).exec();
  if (!project || project.client?.toString() !== pair.client.id) throw denied;

  if (
    project.status === "open_for_bids" ||
    project.assignedEngineer?.toString() === pair.provider.id
  ) {
    return project;
  }
  const [bid, invitation] = await Promise.all([
    Bid.exists({ project: project._id, engineer: pair.provider.id }),
    BidInvitation.exists({ project: project._id, engineer: pair.provider.id }),
  ]);
  if (!bid && !invitation) throw denied;
  return project;
};

/** Whether the two have a project where one hired the other. */
export const hasHireTogether = async (a: ChatUser, b: ChatUser): Promise<boolean> => {
  const pair = clientAndProvider(a, b);
  if (!pair) return false;
  return Boolean(
    await Project.exists({ client: pair.client.id, assignedEngineer: pair.provider.id }),
  );
};

/** Of `otherIds`, the users the viewer has a hire with, in either direction. */
export const hiredPartnerIds = async (
  viewerId: string,
  otherIds: string[],
): Promise<Set<string>> => {
  if (otherIds.length === 0) return new Set();
  const projects = await Project.find({
    $or: [
      { client: viewerId, assignedEngineer: { $in: otherIds } },
      { assignedEngineer: viewerId, client: { $in: otherIds } },
    ],
  })
    .select("client assignedEngineer")
    .exec();
  return new Set(
    projects.map((project) =>
      project.client?.toString() === viewerId
        ? (project.assignedEngineer?.toString() ?? "")
        : (project.client?.toString() ?? ""),
    ),
  );
};

/** Client and provider who haven't hired each other yet. */
export const needsContactMasking = async (a: ChatUser, b: ChatUser): Promise<boolean> =>
  clientAndProvider(a, b) !== null && !(await hasHireTogether(a, b));

export const CONTACT_PLACEHOLDER = "[contact hidden until hire]";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
// A run of digits (Latin or Bangla) with the separators people type in phone
// numbers. Commas are left out so amounts like 12,00,000 never match.
const PHONE_CANDIDATE = /\+?[0-9০-৯][0-9০-৯\s\-.()]{6,}[0-9০-৯]/g;
const MONEY_BEFORE = /(৳|tk\.?|taka|bdt|rs\.?)\s*$/i;

const countDigits = (value: string): number => (value.match(/[0-9০-৯]/g) ?? []).length;

/**
 * Replaces emails and phone numbers (10–15 digits, e.g. 01712-345678,
 * +880 1712 345678, ০১৭১২৩৪৫৬৭৮) with a placeholder. Prices, dates and short
 * numbers are left alone.
 */
export const maskContactInfo = (text: string): { text: string; masked: boolean } => {
  let masked = false;
  const withoutEmails = text.replace(EMAIL, () => {
    masked = true;
    return CONTACT_PLACEHOLDER;
  });
  const result = withoutEmails.replace(PHONE_CANDIDATE, (match, offset: number, whole: string) => {
    const digits = countDigits(match);
    if (digits < 10 || digits > 15) return match;
    if (MONEY_BEFORE.test(whole.slice(Math.max(0, offset - 6), offset))) return match;
    masked = true;
    return CONTACT_PLACEHOLDER;
  });
  return { text: result, masked };
};

/**
 * The projects each conversation is about, as the viewer sees them, newest
 * context first. `pairs` maps conversation id to its two participants.
 */
export const describeConversationProjects = async (
  conversations: Array<{
    id: string;
    participants: [ChatUser, ChatUser] | ChatUser[];
    projects: Array<{ project: Types.ObjectId; addedAt: Date }>;
  }>,
): Promise<Map<string, ConversationProjectView[]>> => {
  const projectIds = [
    ...new Set(conversations.flatMap((entry) => entry.projects.map((p) => p.project.toString()))),
  ];
  const result = new Map<string, ConversationProjectView[]>();
  if (projectIds.length === 0) return result;

  const [projects, bids] = await Promise.all([
    Project.find({ _id: { $in: projectIds } })
      .select("title name status client assignedEngineer")
      .exec(),
    Bid.find({ project: { $in: projectIds } }).select("project engineer").exec(),
  ]);
  const projectById = new Map(projects.map((project) => [project._id.toString(), project]));
  const bidKeys = new Set(bids.map((bid) => `${bid.project.toString()}:${bid.engineer.toString()}`));

  for (const conversation of conversations) {
    const [a, b] = conversation.participants;
    const pair = a && b ? clientAndProvider(a, b) : null;
    const views = [...conversation.projects]
      .sort((x, y) => y.addedAt.getTime() - x.addedAt.getTime())
      .map((entry): ConversationProjectView | null => {
        const project = projectById.get(entry.project.toString());
        if (!project) return null;
        const providerId = pair?.provider.id ?? "";
        const relation: ProjectRelation =
          project.assignedEngineer?.toString() === providerId
            ? "hired"
            : bidKeys.has(`${project._id.toString()}:${providerId}`)
              ? "bidding"
              : project.status === "open_for_bids"
                ? "open"
                : "closed";
        return {
          id: project._id.toString(),
          title: project.title ?? project.name ?? "Untitled project",
          status: project.status,
          relation,
        };
      })
      .filter((view): view is ConversationProjectView => view !== null);
    result.set(conversation.id, views);
  }
  return result;
};
