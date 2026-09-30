import { Types } from "mongoose";
import {
  CASE_FILE_LIMIT,
  CASE_TEXT_LIMIT,
  type CaseFile,
  CaseMessage,
  type CasePartyRole,
  type CaseType,
  type ICaseMessage,
} from "../models/CaseMessage.model";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification, type NotificationType } from "../models/Notification.model";
import { Project } from "../models/Project.model";
import { ProjectDispute } from "../models/ProjectDispute.model";
import { privateDownloadUrl, uploadBuffer } from "./cloudinaryUpload";
import { type EvidenceContext, evidenceFlags, factsForUpload } from "./evidence";
import { projectTitle } from "./projectMoney";

/**
 * A dispute as a "case": a project dispute or a disputed rental deposit.
 * CivilHub talks to each side privately in its own thread, and either side can
 * attach files as evidence. The same helpers serve users and admins.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A case stays "open" until its outcome takes effect: while an admin reviews
 * it, while a decision waits out its appeal window, and during an appeal.
 * Messages are open for as long as that.
 */

export const isCaseType = (value: unknown): value is CaseType => value === "project" || value === "deposit";

export interface CaseParty {
  user: Types.ObjectId;
  role: CasePartyRole;
}

export interface CaseInfo {
  caseType: CaseType;
  caseId: Types.ObjectId;
  parties: CaseParty[];
  active: boolean;
  /** What it's about, for messages: a project's title or a rental's equipment. */
  title: string;
  /** Where a notification about it should link. */
  links: { project?: Types.ObjectId; equipment?: Types.ObjectId; equipmentBooking?: Types.ObjectId };
}

const caseStatusIsActive = (status: string | undefined): boolean => status === "open";

export const loadCase = async (caseType: CaseType, caseId: string | Types.ObjectId): Promise<CaseInfo | null> => {
  if (!Types.ObjectId.isValid(caseId.toString())) return null;
  const id = new Types.ObjectId(caseId.toString());
  if (caseType === "project") {
    const dispute = await ProjectDispute.findById(id).lean().exec();
    if (!dispute) return null;
    const project = await Project.findById(dispute.project).select("title name").lean().exec();
    return {
      caseType,
      caseId: id,
      parties: [
        { user: dispute.client, role: "client" },
        { user: dispute.provider, role: "provider" },
      ],
      active: caseStatusIsActive(dispute.status),
      title: project ? projectTitle(project) : "your project",
      links: { project: dispute.project },
    };
  }
  const booking = await EquipmentBooking.findById(id)
    .select("renter owner equipment depositDispute")
    .populate("equipment", "title")
    .lean()
    .exec();
  if (!booking?.depositDispute) return null;
  const equipment = booking.equipment as unknown as { _id: Types.ObjectId; title?: string } | null;
  return {
    caseType,
    caseId: id,
    parties: [
      { user: booking.renter, role: "renter" },
      { user: booking.owner, role: "owner" },
    ],
    active: caseStatusIsActive(booking.depositDispute.status),
    title: equipment?.title ? `the deposit for ${equipment.title}` : "your rental deposit",
    links: { equipmentBooking: id, ...(equipment?._id ? { equipment: equipment._id } : {}) },
  };
};

export const partyOf = (info: CaseInfo, userId: string): CaseParty | null =>
  info.parties.find((party) => party.user.toString() === userId) ?? null;

export const partyByRole = (info: CaseInfo, role: unknown): CaseParty | null =>
  info.parties.find((party) => party.role === role) ?? null;

export const notifyAboutCase = (
  info: CaseInfo,
  recipient: Types.ObjectId,
  type: NotificationType,
  message: string,
) => Notification.create({ recipient, type, message, ...info.links });

// ---------------------------------------------------------------- files

/** Uploads one evidence file privately: only a signed link can open it. */
export const uploadCaseFile = async (
  file: Express.Multer.File,
  uploadedBy: Types.ObjectId | string | null,
): Promise<CaseFile> => {
  const isPdf = file.mimetype.toLowerCase().startsWith("application/pdf");
  const name = (file.originalname.trim() || (isPdf ? "document.pdf" : "photo")).slice(0, 200);
  const [result, facts] = await Promise.all([
    uploadBuffer(file.buffer, {
      folder: "civilhub/dispute-evidence",
      type: "authenticated",
      resource_type: isPdf ? "raw" : "image",
      ...(isPdf ? { use_filename: true, unique_filename: true, filename_override: name } : {}),
    }),
    factsForUpload(file, uploadedBy),
  ]);
  return {
    publicId: result.public_id,
    resourceType: isPdf ? "raw" : "image",
    format: result.format ?? (isPdf ? "pdf" : ""),
    name,
    mimeType: file.mimetype,
    size: file.size,
    ...facts,
  };
};

// ---------------------------------------------------------------- views

export interface CaseFileView {
  name: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  url: string;
  uploadedAt: string | null;
  takenAt: string | null;
  location: { lat: number; lng: number } | null;
  camera: string | null;
  /** Warnings for admins weighing the file; left out of users' views. */
  flags?: string[];
}

export interface CaseMessageView {
  id: string;
  from: "admin" | "party";
  partyRole: CasePartyRole;
  text: string;
  files: CaseFileView[];
  replyBy: string | null;
  at: string;
}

export const toCaseFileView = (file: CaseFile, context?: EvidenceContext): CaseFileView => ({
  name: file.name,
  mimeType: file.mimeType,
  size: file.size,
  isImage: file.resourceType === "image",
  url: privateDownloadUrl(file.publicId, file.resourceType, file.format),
  uploadedAt: file.uploadedAt?.toISOString() ?? null,
  takenAt: file.takenAt?.toISOString() ?? null,
  location: file.location ? { lat: file.location.lat, lng: file.location.lng } : null,
  camera: file.camera ?? null,
  ...(context ? { flags: evidenceFlags(file, context) } : {}),
});

export const toCaseMessageView = (message: ICaseMessage, context?: EvidenceContext): CaseMessageView => ({
  id: message._id.toString(),
  from: message.from,
  partyRole: message.partyRole,
  text: message.text,
  files: message.files.map((file) => toCaseFileView(file, context)),
  replyBy: message.replyBy?.toISOString() ?? null,
  at: message.createdAt.toISOString(),
});

/** The reply CivilHub is still waiting for in a thread, if any. */
export const pendingReplyBy = (messages: ICaseMessage[]): Date | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.from === "party") return null;
    if (message.replyBy) return message.replyBy;
  }
  return null;
};

export const threadFor = (info: CaseInfo, party: Types.ObjectId): Promise<ICaseMessage[]> =>
  CaseMessage.find({ caseType: info.caseType, caseId: info.caseId, party }).sort({ createdAt: 1 }).exec();

/** What evidence in this case is checked against: when the work began, and where. */
export const evidenceContextFor = async (info: CaseInfo): Promise<EvidenceContext> => {
  if (info.caseType === "project" && info.links.project) {
    const project = await Project.findById(info.links.project).select("site advancePaidAt createdAt").lean().exec();
    if (!project) return {};
    const point = project.site?.point?.coordinates;
    return {
      notBefore: [{ at: project.advancePaidAt ?? project.createdAt, flag: "Taken before the project started." }],
      site: point && point.length === 2 ? { lat: point[1], lng: point[0] } : null,
      siteLabel: "the project site",
    };
  }
  const booking = await EquipmentBooking.findById(info.caseId).select("startDate").lean().exec();
  return booking ? { notBefore: [{ at: booking.startDate, flag: "Taken before the rental started." }] } : {};
};

/** Both sides' threads, as an admin reads them, keyed by role, with evidence flags. */
export const threadsForAdmin = async (
  info: CaseInfo,
): Promise<Record<string, { name?: string; messages: CaseMessageView[]; replyBy: string | null }>> => {
  const threads: Record<string, { messages: CaseMessageView[]; replyBy: string | null }> = {};
  const context = await evidenceContextFor(info);
  for (const party of info.parties) {
    const messages = await threadFor(info, party.user);
    threads[party.role] = {
      messages: messages.map((message) => toCaseMessageView(message, context)),
      replyBy: pendingReplyBy(messages)?.toISOString() ?? null,
    };
  }
  return threads;
};

/** Of these cases, the ones where a party wrote last and CivilHub hasn't answered. */
export const casesAwaitingAdmin = async (caseType: CaseType, caseIds: Types.ObjectId[]): Promise<Set<string>> => {
  if (caseIds.length === 0) return new Set();
  const rows = await CaseMessage.aggregate<{ _id: { caseId: Types.ObjectId; party: Types.ObjectId }; from: string }>([
    { $match: { caseType, caseId: { $in: caseIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: { caseId: "$caseId", party: "$party" }, from: { $first: "$from" } } },
  ]).exec();
  return new Set(rows.filter((row) => row.from === "party").map((row) => row._id.caseId.toString()));
};

/** How many active disputes, of either kind, have a party's message waiting for CivilHub. */
export const countCasesAwaitingAdmin = async (): Promise<number> => {
  const [disputes, bookings] = await Promise.all([
    ProjectDispute.find({ status: "open" }).select("_id").lean().exec(),
    EquipmentBooking.find({ "depositDispute.status": "open" }).select("_id").lean().exec(),
  ]);
  const [projectCases, depositCases] = await Promise.all([
    casesAwaitingAdmin("project", disputes.map((row) => row._id as Types.ObjectId)),
    casesAwaitingAdmin("deposit", bookings.map((row) => row._id as Types.ObjectId)),
  ]);
  return projectCases.size + depositCases.size;
};

// ---------------------------------------------------------------- writing

export const caseError = (message: string, statusCode: number): Error & { statusCode: number } =>
  Object.assign(new Error(message), { statusCode });

export const cleanCaseText = (value: unknown): string =>
  typeof value === "string" ? value.trim().slice(0, CASE_TEXT_LIMIT + 1) : "";

export const checkCaseText = (text: string, required: boolean): void => {
  if (required && !text) throw caseError("Write a message.", 400);
  if (text.length > CASE_TEXT_LIMIT) throw caseError(`Keep it under ${CASE_TEXT_LIMIT} characters.`, 400);
};

export const checkCaseFiles = (files: Express.Multer.File[]): void => {
  if (files.length > CASE_FILE_LIMIT) throw caseError(`Attach up to ${CASE_FILE_LIMIT} files at a time.`, 400);
};

const formatDay = (date: Date): string =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Dhaka" });

/**
 * A day before a reply CivilHub asked for is due, reminds a party who hasn't
 * answered. Sent once per question.
 */
export const settleCaseReplyReminders = async (now: Date = new Date()): Promise<number> => {
  const due = await CaseMessage.find({
    from: "admin",
    replyBy: { $gt: now, $lte: new Date(now.getTime() + DAY_MS) },
    reminderSentAt: null,
  })
    .select("caseType caseId party replyBy createdAt")
    .lean()
    .exec();
  let reminded = 0;
  for (const question of due) {
    const answered = await CaseMessage.exists({
      caseType: question.caseType,
      caseId: question.caseId,
      party: question.party,
      from: "party",
      createdAt: { $gt: question.createdAt },
    }).exec();
    const claimed = await CaseMessage.updateOne(
      { _id: question._id, reminderSentAt: null },
      { $set: { reminderSentAt: now } },
    ).exec();
    if (answered || claimed.modifiedCount !== 1) continue;
    const info = await loadCase(question.caseType, question.caseId);
    if (!info?.active) continue;
    reminded += 1;
    await notifyAboutCase(
      info,
      question.party,
      "dispute_reply_reminder",
      `CivilHub is waiting for your reply about ${info.title}, due by ${formatDay(question.replyBy as Date)}.`,
    );
  }
  return reminded;
};

export { formatDay as formatCaseDay };
