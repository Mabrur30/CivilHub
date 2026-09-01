import { type NextFunction, type Response } from "express";
import { Types, type HydratedDocument } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Bid, type IBid } from "../models/Bid.model";
import { Notification } from "../models/Notification.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { Project, type IProject } from "../models/Project.model";

export interface SubmitBidRequestBody {
  projectId: string;
  amount: number;
  message: string;
}

interface BidError extends Error {
  statusCode: number;
}

interface BidParams {
  bidId: string;
}

interface ClientBidResponse {
  id: string;
  engineerId: string;
  engineerName: string;
  amount: number;
  message: string;
  submittedDate: string;
  status: "pending" | "accepted" | "declined";
}

interface ProjectBidsResponse {
  projectId: string;
  projectName: string;
  bids: ClientBidResponse[];
}

export interface EngineerBidResponse {
  id: string;
  projectId: string;
  clientUserId: string;
  projectTitle: string;
  clientName: string;
  amount: number;
  status: "pending" | "accepted" | "declined";
  submittedDate: string;
  projectStatus: string;
}

const createBidError = (message: string, statusCode: number): BidError => {
  const error = new Error(message) as BidError;
  error.statusCode = statusCode;
  return error;
};

const extractUserId = (value: unknown): string => {
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === "object" && value !== null) {
    const record = value as { _id?: { toString: () => string } };
    if (record._id) {
      return record._id.toString();
    }
  }

  return "";
};

export const submitBid = async (
  req: AuthenticatedRequest<SubmitBidRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "engineer") {
      throw createBidError("Engineer access required", 403);
    }

    const { projectId, amount, message } = req.body;
    if (
      !projectId ||
      !message?.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw createBidError(
        "Project, a positive bid amount, and a message are required",
        400,
      );
    }

    const project = await Project.findOne({
      _id: projectId,
      status: "open_for_bids",
    });
    if (!project) {
      throw createBidError("Project is not open for bidding", 404);
    }

    const existingBid = await Bid.findOne({
      engineer: req.user.userId,
      project: project._id,
      status: "pending",
    });
    if (existingBid) {
      throw createBidError(
        "You already have a pending bid on this project",
        409,
      );
    }

    const bid = await Bid.create({
      engineer: req.user.userId,
      project: project._id,
      amount,
      message: message.trim(),
      status: "pending",
    });

    res.status(201).json({
      id: bid._id.toString(),
      projectId: project._id.toString(),
      amount: bid.amount,
      message: bid.message,
      status: bid.status,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const getBidsForMyProjects = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "client") {
      throw createBidError("Client access required", 403);
    }

    const projects = await Project.find({ client: req.user.userId })
      .select("_id title name")
      .sort({ createdAt: -1 })
      .exec();
    const projectIds = projects.map((project) => project._id);
    const bids = await Bid.find({ project: { $in: projectIds } })
      .populate("engineer", "name")
      .sort({ createdAt: -1 })
      .exec();

    const bidsByProject = new Map<string, ClientBidResponse[]>();
    bids.forEach((bid) => {
      const engineer = bid.engineer as unknown as { name?: string };
      const projectId = bid.project.toString();
      const projectBids = bidsByProject.get(projectId) ?? [];
      projectBids.push({
        id: bid._id.toString(),
        engineerId: extractUserId(bid.engineer),
        engineerName: engineer.name ?? "Unknown engineer",
        amount: bid.amount,
        message: bid.message,
        submittedDate: bid.createdAt.toISOString(),
        status: bid.status,
      });
      bidsByProject.set(projectId, projectBids);
    });

    const response: ProjectBidsResponse[] = projects
      .map((project) => ({
        projectId: project._id.toString(),
        projectName: project.title ?? project.name ?? "Untitled project",
        bids: bidsByProject.get(project._id.toString()) ?? [],
      }))
      .filter((project) => project.bids.length > 0);

    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const getMyBids = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "engineer") {
      throw createBidError("Engineer access required", 403);
    }

    const bids = await Bid.find({ engineer: req.user.userId })
      .populate({
        path: "project",
        select: "title name clientName status client",
        populate: { path: "client", select: "name" },
      })
      .sort({ createdAt: -1 })
      .exec();

    const response: EngineerBidResponse[] = bids.map((bid) => {
      const project = bid.project as unknown as {
        _id: { toString: () => string };
        title?: string;
        name?: string;
        clientName?: string;
        status: string;
        client?: { name?: string };
      };
      return {
        id: bid._id.toString(),
        projectId: project._id.toString(),
        clientUserId: extractUserId(project.client),
        projectTitle: project.title ?? project.name ?? "Untitled project",
        clientName: project.clientName ?? project.client?.name ?? "Client",
        amount: bid.amount,
        status: bid.status,
        submittedDate: bid.createdAt.toISOString(),
        projectStatus: project.status,
      };
    });

    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

const getOwnedBid = async (
  req: AuthenticatedRequest,
): Promise<{
  bid: HydratedDocument<IBid>;
  project: HydratedDocument<IProject>;
}> => {
  const { bidId } = req.params as unknown as BidParams;
  const bid = await Bid.findById(bidId).exec();
  if (!bid) {
    throw createBidError("Bid not found", 404);
  }

  const project = await Project.findOne({
    _id: bid.project,
    client: req.user.userId,
  }).exec();
  if (!project) {
    throw createBidError("You do not own this project", 403);
  }

  return { bid, project };
};

export const acceptBid = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "client") {
      throw createBidError("Client access required", 403);
    }

    const { bid, project } = await getOwnedBid(req);
    if (bid.status !== "pending") {
      throw createBidError("Only pending bids can be accepted", 409);
    }
    if (project.assignedEngineer || project.status !== "open_for_bids") {
      throw createBidError(
        "This project already has an assigned engineer",
        409,
      );
    }

    bid.status = "accepted";
    await bid.save();
    await Bid.updateMany(
      { project: project._id, _id: { $ne: bid._id }, status: "pending" },
      { $set: { status: "declined" } },
    ).exec();
    project.assignedEngineer = bid.engineer;
    project.status = "in-progress";
    project.totalAgreedValue = bid.amount;
    project.phasePlanStatus = "not_created";
    await project.save();
    await Notification.create({
      recipient: bid.engineer,
      type: "bid_accepted",
      message: `Your bid for ${project.title ?? project.name ?? "this project"} was accepted.`,
      project: project._id,
      bid: bid._id,
    });

    res.status(200).json(project);
  } catch (error: unknown) {
    next(error);
  }
};

export const declineBid = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "client") {
      throw createBidError("Client access required", 403);
    }

    const { bid, project } = await getOwnedBid(req);
    if (bid.status !== "pending") {
      throw createBidError("Only pending bids can be declined", 409);
    }

    bid.status = "declined";
    await bid.save();
    await Notification.create({
      recipient: bid.engineer,
      type: "bid_declined",
      message: `Your bid for ${project.title ?? project.name ?? "this project"} was declined.`,
      project: project._id,
      bid: bid._id,
    });

    res.status(200).json({ id: bid._id.toString(), status: bid.status });
  } catch (error: unknown) {
    next(error);
  }
};
