import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  Notification,
  type NotificationType,
} from "../models/Notification.model";
import { Payment, type IPayment, type PaymentType } from "../models/Payment.model";
import { Project, fundsBeforeWork, type IProject } from "../models/Project.model";
import {
  ProjectPhase,
  SUBMISSION_FILE_LIMIT,
  SUBMISSION_NOTE_LIMIT,
  type DeliverableFile,
  type IProjectPhase,
  type PhaseSubmission,
  type ProjectPhaseStatus,
} from "../models/ProjectPhase.model";
import { Review } from "../models/Review.model";
import { CustomerReview } from "../models/CustomerReview.model";
import {
  toCustomerReviewViews,
  type CustomerReviewView,
} from "./customerReview.controller";
import { User, type UserRole } from "../models/User.model";
import { messageAttachmentTypes } from "../middleware/upload.middleware";
import { deleteCloudinaryAsset, uploadBuffer } from "../utils/cloudinaryUpload";
import { factsForUpload } from "../utils/evidence";
import {
  getAdvanceAmount,
  getAmountsPaidByPhase,
  getPhaseAmountsDue,
  getRemainingBalance,
  isPhaseFunded,
} from "../utils/phasePayments";
import {
  describePaymentMethod,
  hasCheckoutInFlight,
  payeeShareNote,
} from "../services/payments";
import { formatTaka } from "../utils/money";
import { assertCanTakeProjects } from "../utils/roles";
import {
  toPrivateSite,
  type PrivateSiteResponse,
} from "../utils/projectSite";
import { type ProjectRequirements } from "../utils/projectCriteria";
import { projectLockReason } from "../utils/projectMoney";

interface ProjectProgressError extends Error {
  statusCode: number;
}

interface ProjectParams {
  projectId?: string;
  phaseId?: string;
}

export interface UpdateProjectPhaseBody {
  status?: ProjectPhaseStatus;
}

export interface RequestPhaseChangesBody {
  note?: string;
}

export interface SubmitPhaseBody {
  note?: string;
}

interface DeliverableFileResponse {
  url: string;
  name: string;
  mimeType: string;
  size: number;
  resourceType: DeliverableFile["resourceType"];
}

interface PhaseSubmissionResponse {
  note: string;
  files: DeliverableFileResponse[];
  submittedAt: string;
}

interface ProjectReviewResponse {
  id: string;
  rating: number;
  reviewText: string;
  engineerReply: string | null;
  engineerRepliedAt: string | null;
  createdAt: string;
}

/** The closing record of a finished project. */
interface ProjectCompletionResponse {
  completedAt: string;
  /** When work could begin: the advance payment. */
  startedAt: string | null;
  /** Everything the client paid, refunds due excluded. */
  totalPaid: number;
  phaseCount: number;
  review: ProjectReviewResponse | null;
  /** What the engineer or company said about the client, once written. */
  customerReview: CustomerReviewView | null;
}

interface ProjectPartyResponse {
  id: string;
  name: string;
  role: UserRole;
}

interface ProjectProgressPhaseResponse {
  id: string;
  name: string;
  description: string;
  order: number;
  status: ProjectPhaseStatus;
  dueDate: string | null;
  completedAt: string | null;
  updatedAt: string;
  price: number;
  paymentStatus: IProjectPhase["paymentStatus"];
  paidAt: string | null;
  /** What approving this phase costs on the phase-by-phase plan. */
  amountDue: number;
  /** What has actually been charged for this phase so far. */
  amountPaid: number;
  changeRequest: { note: string; requestedAt: string } | null;
  /** What the engineer handed over each time they submitted, oldest first. */
  submissions: PhaseSubmissionResponse[];
}

interface ProjectProgressResponse {
  project: {
    id: string;
    name: string;
    status: IProject["status"];
    clientId: string | null;
    assignedEngineerId: string | null;
    currentPhaseName: string;
    progressPercentage: number;
    nextMilestone: string;
    nextMilestoneDueDate: string | null;
    completedAt: string | null;
    category: string | null;
    description: string;
    servicesNeeded: string[];
    requirements: ProjectRequirements | null;
    /** Exact site: this page is only ever shown to the client and hired engineer. */
    site: PrivateSiteResponse | null;
  };
  client: ProjectPartyResponse | null;
  provider: ProjectPartyResponse | null;
  phases: ProjectProgressPhaseResponse[];
  canUpdate: boolean;
  completion: ProjectCompletionResponse | null;
}

const validStatuses: ProjectPhaseStatus[] = [
  "not_started",
  "in_progress",
  "awaiting_approval",
  "completed",
  "delayed",
];

const statusLabels: Record<ProjectPhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_approval: "Awaiting approval",
  completed: "Completed",
  delayed: "Delayed",
};

// The status moves an engineer can make directly. Completing a phase is the
// client's decision (approve), and so is sending it back (request changes), so
// neither appears here, and a completed phase can never be reopened.
// Submitting for approval hands work over, so it goes through submitPhase.
const engineerTransitions: Record<ProjectPhaseStatus, ProjectPhaseStatus[]> = {
  not_started: ["in_progress"],
  in_progress: ["delayed"],
  delayed: ["in_progress"],
  awaiting_approval: [],
  completed: [],
};

const submittableStatuses: ProjectPhaseStatus[] = ["in_progress", "delayed"];

const CHANGE_NOTE_LIMIT = 500;

const createProjectProgressError = (
  message: string,
  statusCode: number,
): ProjectProgressError => {
  const error = new Error(message) as ProjectProgressError;
  error.statusCode = statusCode;
  return error;
};

const getParams = (req: AuthenticatedRequest): ProjectParams =>
  req.params as unknown as ProjectParams;

const isProjectPhaseStatus = (value: unknown): value is ProjectPhaseStatus =>
  typeof value === "string" &&
  validStatuses.includes(value as ProjectPhaseStatus);

const projectLabel = (project: IProject, fallback: string): string =>
  project.title ?? project.name ?? fallback;

const calculateProgressPercentage = (phases: IProjectPhase[]): number => {
  if (phases.length === 0) {
    return 0;
  }

  const completedCount = phases.filter(
    (phase) => phase.status === "completed",
  ).length;

  return Math.round((completedCount / phases.length) * 100);
};

const getCurrentPhaseName = (phases: IProjectPhase[]): string => {
  const activePhase = phases.find(
    (phase) =>
      phase.status === "in_progress" ||
      phase.status === "awaiting_approval" ||
      phase.status === "delayed",
  );

  if (activePhase) {
    return activePhase.name;
  }

  const nextPhase = phases.find((phase) => phase.status === "not_started");
  if (nextPhase) {
    return nextPhase.name;
  }

  return phases.length > 0 ? "Completed" : "Not started";
};

const getNextMilestone = (
  phases: IProjectPhase[],
): { name: string; dueDate: Date | null } => {
  const pendingPhase = phases.find((phase) => phase.status !== "completed");

  if (!pendingPhase) {
    return { name: "Project complete", dueDate: null };
  }

  return {
    name: pendingPhase.name,
    dueDate: pendingPhase.dueDate ?? null,
  };
};

const toSubmissionResponse = (
  submission: PhaseSubmission,
): PhaseSubmissionResponse => ({
  note: submission.note,
  files: submission.files.map((file) => ({
    url: file.url,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    resourceType: file.resourceType,
  })),
  submittedAt: submission.submittedAt.toISOString(),
});

const toPhaseResponse = (
  phase: IProjectPhase,
  amountsDue: Map<string, number>,
  amountsPaid: Map<string, number>,
): ProjectProgressPhaseResponse => {
  const id = phase._id.toString();
  return {
    id,
    name: phase.name,
    description: phase.description ?? "",
    order: phase.order,
    status: phase.status,
    dueDate: phase.dueDate ? phase.dueDate.toISOString() : null,
    completedAt: phase.completedAt ? phase.completedAt.toISOString() : null,
    updatedAt: phase.updatedAt.toISOString(),
    price: phase.price,
    paymentStatus: phase.paymentStatus,
    paidAt: phase.paidAt ? phase.paidAt.toISOString() : null,
    amountDue: amountsDue.get(id) ?? 0,
    amountPaid: amountsPaid.get(id) ?? 0,
    changeRequest: phase.changeRequest
      ? {
          note: phase.changeRequest.note,
          requestedAt: phase.changeRequest.requestedAt.toISOString(),
        }
      : null,
    submissions: (phase.submissions ?? []).map(toSubmissionResponse),
  };
};

const syncProjectProgressSnapshot = async (
  project: IProject,
): Promise<void> => {
  const phases = await ProjectPhase.find({ project: project._id })
    .sort({ order: 1 })
    .exec();

  const nextMilestone = getNextMilestone(phases);
  project.progressPercentage = calculateProgressPercentage(phases);
  project.currentPhaseName = getCurrentPhaseName(phases);
  project.nextMilestone = nextMilestone.name;
  project.nextMilestoneDueDate = nextMilestone.dueDate ?? undefined;
  await project.save();
};

export const isProjectFullyComplete = async (
  project: IProject,
): Promise<boolean> => {
  const phases = await ProjectPhase.find({ project: project._id }).exec();
  if (
    phases.length === 0 ||
    phases.some((phase) => phase.status !== "completed")
  ) {
    return false;
  }

  if (project.paymentPlan === "phase_by_phase") {
    return phases.every((phase) => phase.paymentStatus === "paid");
  }

  return project.paymentPlan === "full_upfront" && project.fullPaymentPaid;
};

const notifyProjectCompleted = async (project: IProject): Promise<void> => {
  const label = projectLabel(project, "Your project");
  const [provider, phaseCount] = await Promise.all([
    project.assignedEngineer
      ? User.findById(project.assignedEngineer).select("name").exec()
      : null,
    ProjectPhase.countDocuments({ project: project._id }).exec(),
  ]);

  const notifications = [];
  if (project.client) {
    notifications.push({
      recipient: project.client,
      type: "project_completed" as const,
      message: `${label} is complete. Leave a review for ${provider?.name ?? "your engineer"}.`,
      project: project._id,
    });
  }
  if (project.assignedEngineer) {
    notifications.push({
      recipient: project.assignedEngineer,
      type: "project_completed" as const,
      message:
        phaseCount === 1
          ? `${label} is complete. Its phase has been approved and paid.`
          : phaseCount === 2
            ? `${label} is complete. Both phases have been approved and paid.`
            : `${label} is complete. All ${phaseCount} phases have been approved and paid.`,
      project: project._id,
    });
  }
  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }
};

/**
 * Marks the project completed once every phase is approved and paid for.
 * The flip is a conditional update, so however many requests race here only
 * one completes the project, and only that one sends the notifications.
 */
export const syncProjectCompletionStatus = async (
  project: IProject,
  options: { notify?: boolean } = {},
): Promise<boolean> => {
  if (!(await isProjectFullyComplete(project))) {
    return false;
  }
  if (project.status === "completed" && project.completedAt) {
    return true;
  }

  const completedAt = project.completedAt ?? new Date();
  const flipped = await Project.findOneAndUpdate(
    { _id: project._id, status: { $ne: "completed" } },
    { $set: { status: "completed", completedAt } },
    { returnDocument: "after" },
  ).exec();
  if (!flipped) {
    // Already completed, perhaps by a request a moment ago. Old records may
    // lack the date.
    await Project.updateOne(
      { _id: project._id, completedAt: null },
      { $set: { completedAt } },
    ).exec();
  }

  project.status = "completed";
  project.completedAt = flipped?.completedAt ?? project.completedAt ?? completedAt;
  if (flipped && options.notify) {
    await notifyProjectCompleted(flipped);
  }
  return true;
};

export const backfillCompletedProjectStatuses = async (): Promise<void> => {
  const projects = await Project.find({ status: { $ne: "completed" } }).exec();
  for (const project of projects) {
    await syncProjectCompletionStatus(project);
  }
};

// Payments change the project with conditional single-document updates, so
// the in-memory copy is out of date afterwards. Re-read it before deriving
// progress or completion from it.
const refreshProjectState = async (projectId: Types.ObjectId): Promise<void> => {
  const fresh = await Project.findById(projectId).exec();
  if (!fresh) return;
  await syncProjectProgressSnapshot(fresh);
  await syncProjectCompletionStatus(fresh, { notify: true });
};

const loadProjectForViewer = async (
  req: AuthenticatedRequest,
): Promise<{ project: IProject; canUpdate: boolean }> => {
  if (!req.user?.userId) {
    throw createProjectProgressError("Authentication required", 401);
  }

  const { projectId } = getParams(req);
  if (!projectId || !Types.ObjectId.isValid(projectId)) {
    throw createProjectProgressError("Project not found", 404);
  }

  const project = await Project.findById(projectId).exec();
  if (!project) {
    throw createProjectProgressError("Project not found", 404);
  }

  const isClient = project.client?.toString() === req.user.userId;
  const isAssignedEngineer =
    project.assignedEngineer?.toString() === req.user.userId;

  if (!isClient && !isAssignedEngineer) {
    throw createProjectProgressError("Forbidden", 403);
  }

  return { project, canUpdate: isAssignedEngineer };
};

const loadOwnedProject = async (
  req: AuthenticatedRequest,
): Promise<IProject> => {
  if (!req.user?.userId || req.user.role !== "client") {
    throw createProjectProgressError("Client access required", 403);
  }

  const { projectId } = getParams(req);
  if (!projectId || !Types.ObjectId.isValid(projectId)) {
    throw createProjectProgressError("Project not found", 404);
  }

  const project = await Project.findById(projectId).exec();
  if (!project) {
    throw createProjectProgressError("Project not found", 404);
  }

  if (project.client?.toString() !== req.user.userId) {
    throw createProjectProgressError("You do not own this project", 403);
  }
  return project;
};

/** Refuses changes to a paused (disputed) or cancelled project. */
const assertProjectUnlocked = (project: IProject): void => {
  const reason = projectLockReason(project);
  if (reason) throw createProjectProgressError(reason, 409);
};

const loadPhase = async (
  req: AuthenticatedRequest,
  project: IProject,
): Promise<IProjectPhase> => {
  const { phaseId } = getParams(req);
  if (!phaseId || !Types.ObjectId.isValid(phaseId)) {
    throw createProjectProgressError("Project phase not found", 404);
  }

  const phase = await ProjectPhase.findOne({
    _id: phaseId,
    project: project._id,
  }).exec();
  if (!phase) {
    throw createProjectProgressError("Project phase not found", 404);
  }
  return phase;
};

const requireApprovedPlan = (project: IProject): void => {
  if (project.phasePlanStatus !== "approved") {
    throw createProjectProgressError(
      "The phase plan has to be approved before phases can change",
      409,
    );
  }
};

const getCompletion = async (
  project: IProject,
  phaseCount: number,
): Promise<ProjectCompletionResponse | null> => {
  if (project.status !== "completed") return null;

  const [payments, review, customerReview] = await Promise.all([
    Payment.find({ project: project._id, status: "paid", refundDue: { $ne: true } })
      .select("amount")
      .exec(),
    Review.findOne({ project: project._id }).exec(),
    project.assignedEngineer
      ? CustomerReview.findOne({ project: project._id, author: project.assignedEngineer }).exec()
      : null,
  ]);
  const totalPaid =
    Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) /
    100;

  return {
    completedAt: (project.completedAt ?? project.updatedAt).toISOString(),
    startedAt: project.advancePaidAt ? project.advancePaidAt.toISOString() : null,
    totalPaid,
    phaseCount,
    review: review
      ? {
          id: review._id.toString(),
          rating: review.rating,
          reviewText: review.reviewText,
          engineerReply: review.engineerReply ?? null,
          engineerRepliedAt: review.engineerRepliedAt
            ? review.engineerRepliedAt.toISOString()
            : null,
          createdAt: review.createdAt.toISOString(),
        }
      : null,
    customerReview: customerReview
      ? ((await toCustomerReviewViews([customerReview]))[0] ?? null)
      : null,
  };
};

export const getProjectProgress = async (
  req: AuthenticatedRequest,
  res: Response<ProjectProgressResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { project, canUpdate } = await loadProjectForViewer(req);
    const [phases, amountsPaid, people] = await Promise.all([
      ProjectPhase.find({ project: project._id }).sort({ order: 1 }).exec(),
      getAmountsPaidByPhase(project._id),
      User.find({
        _id: {
          $in: [project.client, project.assignedEngineer].filter(
            (id): id is Types.ObjectId => Boolean(id),
          ),
        },
      })
        .select("name role")
        .exec(),
    ]);
    const amountsDue = getPhaseAmountsDue(project, phases);
    const nextMilestone = getNextMilestone(phases);
    const toParty = (
      id: Types.ObjectId | null | undefined,
    ): ProjectPartyResponse | null => {
      const person = id
        ? people.find((user) => user._id.toString() === id.toString())
        : undefined;
      return person
        ? { id: person._id.toString(), name: person.name, role: person.role }
        : null;
    };

    res.status(200).json({
      project: {
        id: project._id.toString(),
        name: projectLabel(project, "Untitled project"),
        status: project.status,
        clientId: project.client ? project.client.toString() : null,
        assignedEngineerId: project.assignedEngineer
          ? project.assignedEngineer.toString()
          : null,
        currentPhaseName: getCurrentPhaseName(phases),
        progressPercentage: calculateProgressPercentage(phases),
        nextMilestone: nextMilestone.name,
        nextMilestoneDueDate: nextMilestone.dueDate
          ? nextMilestone.dueDate.toISOString()
          : null,
        completedAt: project.completedAt
          ? project.completedAt.toISOString()
          : null,
        category: project.category ?? null,
        description: project.description ?? "",
        servicesNeeded: project.servicesNeeded ?? [],
        requirements: project.requirements ?? null,
        site: toPrivateSite(project.site),
      },
      client: toParty(project.client),
      provider: toParty(project.assignedEngineer),
      phases: phases.map((phase) =>
        toPhaseResponse(phase, amountsDue, amountsPaid),
      ),
      canUpdate,
      completion: await getCompletion(project, phases.length),
    });
  } catch (error: unknown) {
    next(error);
  }
};

const engineerUpdateMessages: Partial<
  Record<ProjectPhaseStatus, (phase: string, project: string) => string>
> = {
  in_progress: (phase, project) => `Work on ${phase} has started for ${project}.`,
  delayed: (phase, project) => `${phase} is running late on ${project}.`,
};

export const updateProjectPhase = async (
  req: AuthenticatedRequest<UpdateProjectPhaseBody>,
  res: Response<{ success: true; phase: ProjectProgressPhaseResponse }>,
  next: NextFunction,
): Promise<void> => {
  try {
    await assertCanTakeProjects(req.user);

    const { project, canUpdate } = await loadProjectForViewer(req);
    assertProjectUnlocked(project);
    if (!canUpdate) {
      throw createProjectProgressError("Forbidden", 403);
    }
    requireApprovedPlan(project);

    const { status } = req.body;
    if (!isProjectPhaseStatus(status)) {
      throw createProjectProgressError("Invalid phase status", 400);
    }

    const phase = await loadPhase(req, project);
    const from = phase.status;

    if (from === status) {
      throw createProjectProgressError(
        `${phase.name} is already ${statusLabels[status].toLowerCase()}`,
        409,
      );
    }
    if (!engineerTransitions[from].includes(status)) {
      const reason =
        from === "completed"
          ? `${phase.name} is complete and can no longer change`
          : from === "awaiting_approval"
            ? `${phase.name} is waiting for the client to approve it or request changes`
            : status === "completed"
              ? "The client completes a phase by approving it. Submit it for approval instead"
              : status === "awaiting_approval" && submittableStatuses.includes(from)
                ? "Submit the phase with a handover note so the client can review it"
                : `${phase.name} can't move from ${statusLabels[from]} to ${statusLabels[status]}`;
      throw createProjectProgressError(reason, 409);
    }

    // Starting a phase for the first time needs the advance and a finished
    // previous phase. Resuming a delayed phase has already passed these.
    if (from === "not_started" && status === "in_progress") {
      if (!project.advancePaid) {
        throw createProjectProgressError(
          "Advance payment required before work can begin",
          409,
        );
      }
      if (!isPhaseFunded(project, phase, await ProjectPhase.find({ project: project._id }).exec())) {
        throw createProjectProgressError(
          project.paymentPlan === "full_upfront"
            ? "The client needs to pay the remaining balance before work starts"
            : `The client needs to fund ${phase.name} before work starts`,
          409,
        );
      }
      if (phase.order > 0) {
        const previousPhase = await ProjectPhase.findOne({
          project: project._id,
          order: phase.order - 1,
        }).exec();
        const previousDone =
          previousPhase?.status === "completed" &&
          (project.paymentPlan !== "phase_by_phase" ||
            previousPhase.paymentStatus === "paid");
        if (!previousDone) {
          throw createProjectProgressError(
            `${previousPhase?.name ?? "The previous phase"} has to be approved before this phase can start`,
            409,
          );
        }
      }
    }

    // Conditional on the status we just checked, so two quick clicks can't
    // both apply a transition.
    const updated = await ProjectPhase.findOneAndUpdate(
      { _id: phase._id, status: from },
      { $set: { status } },
      { returnDocument: "after" },
    ).exec();
    if (!updated) {
      throw createProjectProgressError(
        "This phase was just updated. Refresh to see its current status.",
        409,
      );
    }

    await refreshProjectState(project._id);

    const message = engineerUpdateMessages[status];
    if (message && project.client) {
      await Notification.create({
        recipient: project.client,
        type: "project_phase_updated",
        message: message(updated.name, projectLabel(project, "your project")),
        project: project._id,
      });
    }

    const phases = await ProjectPhase.find({ project: project._id }).exec();
    res.status(200).json({
      success: true,
      phase: toPhaseResponse(
        updated,
        getPhaseAmountsDue(project, phases),
        await getAmountsPaidByPhase(project._id),
      ),
    });
  } catch (error: unknown) {
    next(error);
  }
};

// ============ Handing a phase over ============

// Images stay images so they can be previewed; everything else is stored as a
// raw file so it downloads unchanged, with its original name.
const uploadDeliverable = async (
  file: Express.Multer.File,
  uploadedBy: string,
): Promise<DeliverableFile> => {
  const name = file.originalname.trim() || "file";
  const mimeType = file.mimetype.split(";")[0].trim().toLowerCase();
  const resourceType = mimeType.startsWith("image/") ? "image" : "raw";
  const [result, facts] = await Promise.all([
    uploadBuffer(file.buffer, {
      folder: "civilhub/project-deliverables",
      resource_type: resourceType,
      ...(resourceType === "raw"
        ? { use_filename: true, unique_filename: true, filename_override: name }
        : {}),
    }),
    // Who handed it over, and for photos the camera's date and place.
    factsForUpload(file, uploadedBy),
  ]);
  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType,
    name,
    mimeType,
    size: file.size,
    ...facts,
  };
};

const discardDeliverables = async (files: DeliverableFile[]): Promise<void> => {
  await Promise.all(
    files.map((file) =>
      deleteCloudinaryAsset(file.publicId, file.resourceType).catch(() => undefined),
    ),
  );
};

/**
 * Submits a phase for the client's approval with what the engineer is
 * handing over: a note, and optionally drawings, photos or reports.
 */
export const submitPhase = async (
  req: AuthenticatedRequest<SubmitPhaseBody>,
  res: Response<{ success: true; phase: ProjectProgressPhaseResponse }>,
  next: NextFunction,
): Promise<void> => {
  try {
    await assertCanTakeProjects(req.user);

    const { project, canUpdate } = await loadProjectForViewer(req);
    assertProjectUnlocked(project);
    if (!canUpdate) {
      throw createProjectProgressError("Forbidden", 403);
    }
    requireApprovedPlan(project);
    const phase = await loadPhase(req, project);
    const from = phase.status;
    if (!submittableStatuses.includes(from)) {
      throw createProjectProgressError(
        from === "awaiting_approval"
          ? `${phase.name} is already waiting for the client's approval`
          : from === "completed"
            ? `${phase.name} is complete and can no longer change`
            : `Start ${phase.name} before submitting it`,
        409,
      );
    }

    const note = typeof req.body.note === "string" ? req.body.note.trim() : "";
    if (!note) {
      throw createProjectProgressError(
        "Describe what you're handing over so the client knows what to review",
        400,
      );
    }
    if (note.length > SUBMISSION_NOTE_LIMIT) {
      throw createProjectProgressError(
        `Keep the handover note to ${SUBMISSION_NOTE_LIMIT} characters or fewer`,
        400,
      );
    }

    const uploads = Array.isArray(req.files) ? req.files : [];
    if (uploads.length > SUBMISSION_FILE_LIMIT) {
      throw createProjectProgressError(
        `Attach at most ${SUBMISSION_FILE_LIMIT} files`,
        400,
      );
    }
    const unsupported = uploads.find(
      (file) =>
        !messageAttachmentTypes.includes(
          file.mimetype.split(";")[0].trim().toLowerCase(),
        ),
    );
    if (unsupported) {
      throw createProjectProgressError(
        `${unsupported.originalname} isn't a supported file type`,
        400,
      );
    }

    const files = await Promise.all(uploads.map((file) => uploadDeliverable(file, req.user.userId)));
    const submission: PhaseSubmission = { note, files, submittedAt: new Date() };

    // Conditional on the status we checked, so a double submit can't add two
    // handovers or skip the client's decision.
    const updated = await ProjectPhase.findOneAndUpdate(
      { _id: phase._id, status: from },
      {
        // A fresh hand-over starts the reminder clock again.
        $set: { status: "awaiting_approval", approvalReminderSentAt: null, escalationNoticeSentAt: null },
        $push: { submissions: submission },
      },
      { returnDocument: "after" },
    ).exec();
    if (!updated) {
      await discardDeliverables(files);
      throw createProjectProgressError(
        "This phase was just updated. Refresh to see its current status.",
        409,
      );
    }

    await refreshProjectState(project._id);

    if (project.client) {
      const attached =
        files.length === 0
          ? ""
          : files.length === 1
            ? " 1 file attached."
            : ` ${files.length} files attached.`;
      await Notification.create({
        recipient: project.client,
        type: "project_phase_updated",
        message: `${updated.name} is ready for your approval on ${projectLabel(project, "your project")}.${attached}`,
        project: project._id,
      });
    }

    const phases = await ProjectPhase.find({ project: project._id }).exec();
    res.status(200).json({
      success: true,
      phase: toPhaseResponse(
        updated,
        getPhaseAmountsDue(project, phases),
        await getAmountsPaidByPhase(project._id),
      ),
    });
  } catch (error: unknown) {
    next(error);
  }
};

// ============ Client phase decisions ============

/** What approving a phase charges right now, or null when approval is free. */
export interface PhaseCharge {
  type: "phase" | "full_remaining";
  amount: number;
}

const getPhaseCharge = (
  project: IProject,
  phase: IProjectPhase,
  phases: IProjectPhase[],
): PhaseCharge | null => {
  // Funded work was paid for before it started, so approving it is free.
  if (fundsBeforeWork(project) && isPhaseFunded(project, phase, phases)) {
    return null;
  }
  if (project.paymentPlan === "phase_by_phase") {
    return {
      type: "phase",
      amount: getPhaseAmountsDue(project, phases).get(phase._id.toString()) ?? 0,
    };
  }
  const isFinalPhase =
    phase.order === Math.max(...phases.map((item) => item.order));
  if (
    project.paymentPlan === "full_upfront" &&
    isFinalPhase &&
    !project.fullPaymentPaid
  ) {
    return { type: "full_remaining", amount: getRemainingBalance(project) };
  }
  return null;
};

/**
 * Checks the client can approve this phase now. Phases an engineer marked
 * complete under the old rules were never paid for; approving them now
 * settles the payment, so they count as approvable too.
 */
const assertPhaseApprovable = (
  project: IProject,
  phase: IProjectPhase,
): { isLegacyUnpaid: boolean } => {
  const isLegacyUnpaid =
    project.paymentPlan === "phase_by_phase" &&
    phase.status === "completed" &&
    phase.paymentStatus === "unpaid";

  if (phase.status === "completed" && !isLegacyUnpaid) {
    throw createProjectProgressError(
      `${phase.name} has already been approved`,
      409,
    );
  }
  if (phase.status !== "awaiting_approval" && !isLegacyUnpaid) {
    throw createProjectProgressError(
      `${phase.name} hasn't been submitted for approval yet`,
      409,
    );
  }
  if (!project.advancePaid) {
    throw createProjectProgressError(
      "Pay the advance before approving phases",
      409,
    );
  }
  return { isLegacyUnpaid };
};

/** Completes the phase once, however many requests race for it. */
const completePhase = (
  project: IProject,
  phase: IProjectPhase,
  isLegacyUnpaid: boolean,
  now: Date,
): Promise<IProjectPhase | null> =>
  ProjectPhase.findOneAndUpdate(
    isLegacyUnpaid
      ? { _id: phase._id, status: "completed", paymentStatus: "unpaid" }
      : { _id: phase._id, status: "awaiting_approval" },
    {
      $set: {
        status: "completed",
        completedAt: isLegacyUnpaid ? (phase.completedAt ?? now) : now,
        changeRequest: null,
        // A funded phase keeps the date it was funded.
        ...(project.paymentPlan === "phase_by_phase" && phase.paymentStatus !== "paid"
          ? { paymentStatus: "paid", paidAt: now }
          : {}),
      },
    },
    { returnDocument: "after" },
  ).exec();

/** Marks the remaining balance paid once; false if it already was. */
const claimRemainingBalance = async (
  projectId: Types.ObjectId,
  paidAt: Date,
): Promise<boolean> => {
  const claimed = await Project.findOneAndUpdate(
    { _id: projectId, advancePaid: true, fullPaymentPaid: false },
    { $set: { fullPaymentPaid: true, fullPaymentPaidAt: paidAt } },
    { returnDocument: "after" },
  ).exec();
  return Boolean(claimed);
};

/**
 * Approves a phase that costs nothing to approve: any phase on the full
 * upfront plan except a final one with the balance still unpaid. Phases that
 * need a payment are approved by paying for them (see payment.controller).
 */
/**
 * Whether CivilHub can approve this handed-over phase for the client: it's
 * waiting for approval and approving it needs no new payment.
 */
export const canApproveWithoutPayment = (
  project: IProject,
  phase: IProjectPhase,
  phases: IProjectPhase[],
): boolean => {
  if (phase.status !== "awaiting_approval" || !project.advancePaid) return false;
  const charge = getPhaseCharge(project, phase, phases);
  return !charge || charge.amount <= 0;
};

/**
 * An admin approves a handed-over phase on the client's behalf, after a
 * dispute. Only where no payment is due; returns false if it can't be done.
 */
export const approvePhaseForClient = async (projectId: Types.ObjectId, phaseId: string): Promise<boolean> => {
  const project = await Project.findById(projectId).exec();
  if (!project || !Types.ObjectId.isValid(phaseId)) return false;
  const phases = await ProjectPhase.find({ project: project._id }).exec();
  const phase = phases.find((item) => item._id.toString() === phaseId);
  if (!phase || !canApproveWithoutPayment(project, phase, phases)) return false;

  const now = new Date();
  const charge = getPhaseCharge(project, phase, phases);
  const approved = await completePhase(project, phase, false, now);
  if (!approved) return false;
  if (charge?.type === "full_remaining") {
    await claimRemainingBalance(project._id, now);
  }
  if (project.assignedEngineer) {
    await Notification.create({
      recipient: project.assignedEngineer,
      type: "project_phase_updated",
      message: `CivilHub approved ${phase.name} on ${projectLabel(project, "your project")}.${fundsBeforeWork(project) ? " The money CivilHub held for it is released to you." : ""}`,
      project: project._id,
    });
  }
  await refreshProjectState(project._id);
  return true;
};

export const approvePhase = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req);
    assertProjectUnlocked(project);
    requireApprovedPlan(project);
    const phase = await loadPhase(req, project);
    const { isLegacyUnpaid } = assertPhaseApprovable(project, phase);

    const phases = await ProjectPhase.find({ project: project._id }).exec();
    const charge = getPhaseCharge(project, phase, phases);
    if (charge && charge.amount > 0) {
      throw createProjectProgressError(
        `Approving ${phase.name} needs a payment of ${formatTaka(charge.amount)}. Use Approve & pay.`,
        409,
      );
    }

    const now = new Date();
    const approved = await completePhase(project, phase, isLegacyUnpaid, now);
    if (!approved) {
      throw createProjectProgressError(
        `${phase.name} has already been approved`,
        409,
      );
    }
    // A zero balance (the advance covered everything) settles without a charge.
    if (charge?.type === "full_remaining") {
      await claimRemainingBalance(project._id, now);
    }

    if (project.assignedEngineer) {
      await Notification.create({
        recipient: project.assignedEngineer,
        type: "project_phase_updated",
        message: `The client approved ${phase.name} on ${projectLabel(project, "your project")}.${fundsBeforeWork(project) ? " The money CivilHub held for it is released to you." : ""}`,
        project: project._id,
      });
    }

    // After the approval notice, so "project complete" is the newest one.
    await refreshProjectState(project._id);

    res.status(200).json({
      success: true,
      phase: phase.name,
      amountCharged: 0,
      paidAt: null,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const requestPhaseChanges = async (
  req: AuthenticatedRequest<RequestPhaseChangesBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req);
    assertProjectUnlocked(project);
    requireApprovedPlan(project);
    const phase = await loadPhase(req, project);
    if (await hasCheckoutInFlight({ phase: phase._id })) {
      throw createProjectProgressError(
        "A payment for this phase is in progress. Finish or cancel it before requesting changes.",
        409,
      );
    }

    const note = typeof req.body.note === "string" ? req.body.note.trim() : "";
    if (!note) {
      throw createProjectProgressError(
        "Say what needs to change so the engineer knows what to fix",
        400,
      );
    }
    if (note.length > CHANGE_NOTE_LIMIT) {
      throw createProjectProgressError(
        `Keep the note to ${CHANGE_NOTE_LIMIT} characters or fewer`,
        400,
      );
    }

    const updated = await ProjectPhase.findOneAndUpdate(
      { _id: phase._id, status: "awaiting_approval" },
      {
        $set: {
          status: "in_progress",
          changeRequest: { note, requestedAt: new Date() },
        },
      },
      { returnDocument: "after" },
    ).exec();
    if (!updated) {
      throw createProjectProgressError(
        `${phase.name} isn't waiting for your approval`,
        409,
      );
    }

    await refreshProjectState(project._id);

    if (project.assignedEngineer) {
      await Notification.create({
        recipient: project.assignedEngineer,
        type: "project_phase_updated",
        message: `The client asked for changes to ${phase.name} on ${projectLabel(project, "your project")}: "${note}"`,
        project: project._id,
      });
    }

    res.status(200).json({ success: true, phase: updated.name });
  } catch (error: unknown) {
    next(error);
  }
};

// ============ Gateway payments ============
// Checkouts start in payment.controller. These rules decide what a client may
// pay for and how much, and what a verified payment does to the project.

export interface ProjectCharge {
  project: IProject;
  phase: IProjectPhase | null;
  type: PaymentType;
  amount: number;
  payee: Types.ObjectId;
  productName: string;
  returnPath: string;
}

export type ProjectChargePurpose = "advance" | "phase" | "full_remaining";

const findClientProject = async (
  userId: string,
  role: string,
  projectId: unknown,
): Promise<IProject> => {
  if (role !== "client") {
    throw createProjectProgressError("Client access required", 403);
  }
  if (typeof projectId !== "string" || !Types.ObjectId.isValid(projectId)) {
    throw createProjectProgressError("Project not found", 404);
  }
  const project = await Project.findById(projectId).exec();
  if (!project) {
    throw createProjectProgressError("Project not found", 404);
  }
  if (project.client?.toString() !== userId) {
    throw createProjectProgressError("You do not own this project", 403);
  }
  return project;
};

/**
 * Paying a phase into CivilHub's hold before work on it starts. Phases are
 * funded in order, though a client may fund several ahead.
 */
const fundingCharge = (
  project: IProject,
  phase: IProjectPhase,
  phases: IProjectPhase[],
  label: string,
): Pick<ProjectCharge, "phase" | "type" | "amount" | "productName"> => {
  if (project.paymentPlan !== "phase_by_phase") {
    throw createProjectProgressError(
      "On the full upfront plan, pay the remaining balance instead",
      409,
    );
  }
  if (!project.advancePaid) {
    throw createProjectProgressError("Pay the advance first", 409);
  }
  if (phase.status === "completed" || phase.paymentStatus === "paid") {
    throw createProjectProgressError(`${phase.name} is already funded`, 409);
  }
  const unfundedBefore = phases.find(
    (item) =>
      item.order < phase.order && !isPhaseFunded(project, item, phases),
  );
  if (unfundedBefore) {
    throw createProjectProgressError(
      `Fund ${unfundedBefore.name} first; phases are funded in order`,
      409,
    );
  }
  const amount = getPhaseAmountsDue(project, phases).get(phase._id.toString()) ?? 0;
  if (amount <= 0) {
    throw createProjectProgressError(
      `${phase.name} has nothing to pay; the advance covers it`,
      409,
    );
  }
  return {
    phase,
    type: "phase",
    amount,
    productName: `Funding for ${phase.name} - ${label}`,
  };
};

/** Works out what the client owes for this purpose, or explains why nothing is due. */
export const prepareProjectCharge = async (
  userId: string,
  role: string,
  purpose: ProjectChargePurpose,
  projectId: unknown,
  phaseId: unknown,
): Promise<ProjectCharge> => {
  const project = await findClientProject(userId, role, projectId);
  assertProjectUnlocked(project);
  if (!project.assignedEngineer) {
    throw createProjectProgressError(
      "This project has no engineer to pay yet",
      409,
    );
  }
  const label = projectLabel(project, "Project");
  const base = {
    project,
    payee: project.assignedEngineer,
    returnPath: `/dashboard/client/projects/${project._id.toString()}`,
  };

  if (purpose === "advance") {
    if (project.phasePlanStatus !== "approved") {
      throw createProjectProgressError(
        "Phase plan must be approved before payment",
        409,
      );
    }
    if (project.advancePaid) {
      throw createProjectProgressError(
        "Advance payment has already been made",
        409,
      );
    }
    return {
      ...base,
      phase: null,
      type: "advance",
      amount: getAdvanceAmount(project),
      productName: `Advance for ${label}`,
    };
  }

  if (purpose === "full_remaining") {
    if (project.paymentPlan !== "full_upfront") {
      throw createProjectProgressError(
        "This project uses a different payment plan",
        409,
      );
    }
    if (!project.advancePaid) {
      throw createProjectProgressError(
        "Advance payment must be made first",
        409,
      );
    }
    if (project.fullPaymentPaid) {
      throw createProjectProgressError(
        "Full payment has already been made",
        409,
      );
    }
    return {
      ...base,
      phase: null,
      type: "full_remaining",
      amount: getRemainingBalance(project),
      productName: `Remaining balance for ${label}`,
    };
  }

  requireApprovedPlan(project);
  if (typeof phaseId !== "string" || !Types.ObjectId.isValid(phaseId)) {
    throw createProjectProgressError("Project phase not found", 404);
  }
  const phase = await ProjectPhase.findOne({
    _id: phaseId,
    project: project._id,
  }).exec();
  if (!phase) {
    throw createProjectProgressError("Project phase not found", 404);
  }
  const phases = await ProjectPhase.find({ project: project._id }).exec();
  if (fundsBeforeWork(project) && phase.status !== "awaiting_approval") {
    return { ...base, ...fundingCharge(project, phase, phases, label) };
  }
  assertPhaseApprovable(project, phase);
  const charge = getPhaseCharge(project, phase, phases);
  if (!charge || charge.amount <= 0) {
    throw createProjectProgressError(
      `${phase.name} has nothing to pay. Approve it instead.`,
      409,
    );
  }
  return {
    ...base,
    phase,
    type: charge.type,
    amount: charge.amount,
    productName: `${phase.name} - ${label}`,
  };
};

/**
 * Applies a verified payment to its project. Returns false when there was
 * nothing left to pay for (already paid, or the phase moved on), so the
 * caller can flag the money for a refund.
 */
export const applyProjectPayment = async (
  payment: IPayment,
): Promise<boolean> => {
  const project = payment.project
    ? await Project.findById(payment.project).exec()
    : null;
  if (!project) return false;

  const paidAt = payment.paidAt ?? new Date();
  const label = projectLabel(project, "your project");
  const via = ` via ${describePaymentMethod(payment.cardType)}`;
  const share = payeeShareNote(payment);
  let applied = false;
  let type: NotificationType = "phase_payment_received";
  let message = `Remaining payment of ${formatTaka(payment.amount)} received${via} for ${label}.${share}`;

  if (payment.type === "advance") {
    const claimed = await Project.findOneAndUpdate(
      { _id: project._id, phasePlanStatus: "approved", advancePaid: false },
      { $set: { advancePaid: true, advancePaidAt: paidAt } },
      { returnDocument: "after" },
    ).exec();
    applied = Boolean(claimed);
    type = "advance_payment_received";
    message = `Advance payment of ${formatTaka(payment.amount)} received${via} for ${label}. Work can now begin.${share}`;
  } else if (payment.type === "full_remaining" && !payment.phase) {
    applied = await claimRemainingBalance(project._id, paidAt);
    type = "full_payment_received";
  } else if (payment.phase && payment.type === "phase" && fundsBeforeWork(project)) {
    // Funding: the money is held until the client approves the phase.
    const funded = await ProjectPhase.findOneAndUpdate(
      { _id: payment.phase, paymentStatus: "unpaid", status: { $ne: "completed" } },
      { $set: { paymentStatus: "paid", paidAt } },
      { returnDocument: "after" },
    ).exec();
    applied = Boolean(funded);
    if (funded) {
      message = `The client funded ${funded.name} on ${label} with ${formatTaka(payment.amount)}${via}. You can start work; CivilHub holds the money until they approve the phase.${share}`;
      // Funded while already handed over (it shouldn't happen): paying was the approval.
      if (funded.status === "awaiting_approval") {
        await completePhase(project, funded, false, paidAt);
      }
    }
  } else if (payment.phase) {
    const phase = await ProjectPhase.findById(payment.phase).exec();
    let approvable: { isLegacyUnpaid: boolean } | null = null;
    try {
      approvable = phase ? assertPhaseApprovable(project, phase) : null;
    } catch {
      approvable = null;
    }

    // On the full-upfront plan the balance is owed whatever the phase does.
    if (payment.type === "full_remaining") {
      applied = await claimRemainingBalance(project._id, paidAt);
      type = "full_payment_received";
    }
    const completed =
      phase && approvable
        ? await completePhase(project, phase, approvable.isLegacyUnpaid, paidAt)
        : null;
    if (payment.type === "phase") applied = Boolean(completed);
    if (completed) {
      message = `The client approved ${completed.name} on ${label} and paid ${formatTaka(payment.amount)}${via}.${share}`;
    }
  }

  if (applied && project.assignedEngineer) {
    await Notification.create({
      recipient: project.assignedEngineer,
      type,
      message,
      project: project._id,
    });
  }

  // After the payment notice, so "project complete" is the newest one.
  await refreshProjectState(project._id);
  return applied;
};
