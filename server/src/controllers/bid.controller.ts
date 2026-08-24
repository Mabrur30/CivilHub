import { type NextFunction, type Response } from "express";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Bid } from "../models/Bid.model";
import { Project } from "../models/Project.model";

export interface SubmitBidRequestBody {
  projectId: string;
  amount: number;
  message: string;
}

interface BidError extends Error {
  statusCode: number;
}

const createBidError = (message: string, statusCode: number): BidError => {
  const error = new Error(message) as BidError;
  error.statusCode = statusCode;
  return error;
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
