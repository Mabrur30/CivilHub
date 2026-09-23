import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { createBidForProject } from "./bid.controller";
import { BidInvitation } from "../models/BidInvitation.model";
import { Project } from "../models/Project.model";
import { User } from "../models/User.model";

interface BidInvitationError extends Error {
  statusCode: number;
}

export interface CreateBidInvitationBody {
  projectId: string;
  engineerId: string;
}

export interface AcceptBidInvitationBody {
  amount: number;
  message: string;
}

interface EngineerParams {
  engineerId?: string;
}

interface InvitationParams {
  invitationId?: string;
}

const createBidInvitationError = (
  message: string,
  statusCode: number,
): BidInvitationError => {
  const error = new Error(message) as BidInvitationError;
  error.statusCode = statusCode;
  return error;
};

const requireUser = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId) {
    throw createBidInvitationError("Authentication required", 401);
  }
  return req.user.userId;
};

const requireClient = (req: AuthenticatedRequest): string => {
  const userId = requireUser(req);
  if (req.user.role !== "client") {
    throw createBidInvitationError("Client access required", 403);
  }
  return userId;
};

const requireEngineer = (req: AuthenticatedRequest): string => {
  const userId = requireUser(req);
  if (req.user.role !== "engineer") {
    throw createBidInvitationError("Engineer access required", 403);
  }
  return userId;
};

const getEngineerParams = (req: AuthenticatedRequest): EngineerParams =>
  req.params as unknown as EngineerParams;

const getInvitationParams = (req: AuthenticatedRequest): InvitationParams =>
  req.params as unknown as InvitationParams;

const getProjectTitle = (project: { title?: string; name?: string }): string =>
  project.title ?? project.name ?? "Untitled project";

const ensureEngineerUser = async (engineerId: string): Promise<void> => {
  if (!Types.ObjectId.isValid(engineerId)) {
    throw createBidInvitationError("Engineer not found", 404);
  }

  const engineer = await User.findOne({ _id: engineerId, role: "engineer" })
    .select("_id")
    .exec();
  if (!engineer) {
    throw createBidInvitationError("Engineer not found", 404);
  }
};

export const getClientInviteProjectsForEngineer = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const clientUserId = requireClient(req);
    const { engineerId } = getEngineerParams(req);

    if (!engineerId) {
      throw createBidInvitationError("Engineer ID is required", 400);
    }

    await ensureEngineerUser(engineerId);

    const projects = await Project.find({
      client: clientUserId,
      status: { $ne: "completed" },
    })
      .select("_id title name status createdAt")
      .sort({ createdAt: -1 })
      .exec();

    const projectIds = projects.map((project) => project._id);
    const invitations =
      projectIds.length === 0
        ? []
        : await BidInvitation.find({
            client: clientUserId,
            engineer: engineerId,
            project: { $in: projectIds },
          })
            .select("project status createdAt respondedAt resultingBid")
            .exec();

    const invitationByProject = new Map(
      invitations.map((invitation) => [
        invitation.project.toString(),
        invitation,
      ]),
    );

    res.status(200).json({
      engineerId,
      projects: projects.map((project) => {
        const invitation = invitationByProject.get(project._id.toString());
        const status = project.status;
        return {
          id: project._id.toString(),
          title: getProjectTitle(project),
          status,
          canInvite: status === "open_for_bids" && !invitation,
          invitation: invitation
            ? {
                id: invitation._id.toString(),
                status: invitation.status,
                createdAt: invitation.createdAt.toISOString(),
                respondedAt: invitation.respondedAt?.toISOString() ?? null,
                resultingBidId: invitation.resultingBid?.toString() ?? null,
              }
            : null,
        };
      }),
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const createBidInvitation = async (
  req: AuthenticatedRequest<CreateBidInvitationBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const clientUserId = requireClient(req);
    const { projectId, engineerId } = req.body;

    if (!projectId || !engineerId) {
      throw createBidInvitationError(
        "Project ID and engineer ID are required",
        400,
      );
    }

    if (!Types.ObjectId.isValid(projectId)) {
      throw createBidInvitationError("Project not found", 404);
    }

    await ensureEngineerUser(engineerId);

    const project = await Project.findOne({
      _id: projectId,
      client: clientUserId,
      status: { $ne: "completed" },
    })
      .select("_id title name status")
      .exec();

    if (!project) {
      throw createBidInvitationError(
        "Project not found or you do not own this project",
        404,
      );
    }

    if (project.status !== "open_for_bids") {
      throw createBidInvitationError(
        "Only projects open for bids can send invitations",
        409,
      );
    }

    const existing = await BidInvitation.findOne({
      project: project._id,
      engineer: engineerId,
    })
      .select("_id status")
      .exec();

    if (existing) {
      throw createBidInvitationError(
        `An invitation for this engineer and project already exists (${existing.status})`,
        409,
      );
    }

    const invitation = await BidInvitation.create({
      project: project._id,
      client: clientUserId,
      engineer: engineerId,
      status: "pending",
    });

    res.status(201).json({
      id: invitation._id.toString(),
      projectId: project._id.toString(),
      projectTitle: getProjectTitle(project),
      engineerId,
      status: invitation.status,
      createdAt: invitation.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const getMyPendingBidInvitations = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineerUserId = requireEngineer(req);

    const invitations = await BidInvitation.find({
      engineer: engineerUserId,
      status: "pending",
    })
      .populate("project", "title name status")
      .populate("client", "name")
      .sort({ createdAt: -1 })
      .exec();

    res.status(200).json(
      invitations.map((invitation) => {
        const project = invitation.project as unknown as {
          _id: Types.ObjectId;
          title?: string;
          name?: string;
          status: string;
        };
        const client = invitation.client as unknown as {
          _id: Types.ObjectId;
          name?: string;
        };

        return {
          id: invitation._id.toString(),
          projectId: project._id.toString(),
          projectTitle: getProjectTitle(project),
          projectStatus: project.status,
          client: {
            id: client._id.toString(),
            name: client.name ?? "Client",
          },
          status: invitation.status,
          createdAt: invitation.createdAt.toISOString(),
        };
      }),
    );
  } catch (error: unknown) {
    next(error);
  }
};

export const acceptBidInvitation = async (
  req: AuthenticatedRequest<AcceptBidInvitationBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineerUserId = requireEngineer(req);
    const { invitationId } = getInvitationParams(req);

    if (!invitationId) {
      throw createBidInvitationError("Invitation ID is required", 400);
    }

    if (!Types.ObjectId.isValid(invitationId)) {
      throw createBidInvitationError("Invitation not found", 404);
    }

    const { amount, message } = req.body;
    if (!Number.isFinite(amount) || amount <= 0 || !message?.trim()) {
      throw createBidInvitationError(
        "A positive bid amount and message are required",
        400,
      );
    }

    const invitation = await BidInvitation.findOne({
      _id: invitationId,
      engineer: engineerUserId,
    }).exec();

    if (!invitation) {
      throw createBidInvitationError("Invitation not found", 404);
    }

    if (invitation.status !== "pending") {
      throw createBidInvitationError(
        "This invitation has already been responded to",
        409,
      );
    }

    const { bid, project } = await createBidForProject({
      engineerUserId,
      projectId: invitation.project.toString(),
      amount,
      message,
    });

    invitation.status = "accepted";
    invitation.respondedAt = new Date();
    invitation.resultingBid = bid._id;
    await invitation.save();

    res.status(200).json({
      invitation: {
        id: invitation._id.toString(),
        status: invitation.status,
        respondedAt: invitation.respondedAt?.toISOString() ?? null,
        resultingBidId: bid._id.toString(),
      },
      bid: {
        id: bid._id.toString(),
        projectId: project._id.toString(),
        projectTitle: getProjectTitle(project),
        amount: bid.amount,
        message: bid.message,
        status: bid.status,
      },
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const declineBidInvitation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineerUserId = requireEngineer(req);
    const { invitationId } = getInvitationParams(req);

    if (!invitationId) {
      throw createBidInvitationError("Invitation ID is required", 400);
    }

    if (!Types.ObjectId.isValid(invitationId)) {
      throw createBidInvitationError("Invitation not found", 404);
    }

    const invitation = await BidInvitation.findOne({
      _id: invitationId,
      engineer: engineerUserId,
    }).exec();

    if (!invitation) {
      throw createBidInvitationError("Invitation not found", 404);
    }

    if (invitation.status !== "pending") {
      throw createBidInvitationError(
        "This invitation has already been responded to",
        409,
      );
    }

    invitation.status = "declined";
    invitation.respondedAt = new Date();
    await invitation.save();

    res.status(200).json({
      id: invitation._id.toString(),
      status: invitation.status,
      respondedAt: invitation.respondedAt?.toISOString() ?? null,
    });
  } catch (error: unknown) {
    next(error);
  }
};
