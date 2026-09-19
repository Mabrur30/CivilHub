import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { Project } from "../models/Project.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { Review, type IReview } from "../models/Review.model";
import { User } from "../models/User.model";

interface ReviewError extends Error {
  statusCode: number;
}

interface ProjectParams {
  projectId?: string;
}

interface ReviewParams {
  projectId?: string;
  bookingId?: string;
  equipmentId?: string;
  reviewId?: string;
  engineerUserId?: string;
}

export interface CreateReviewRequestBody {
  projectId: string;
  rating: number;
  reviewText: string;
}

export interface CreateEquipmentReviewRequestBody {
  bookingId: string;
  rating: number;
  reviewText: string;
}

export interface ReplyToReviewRequestBody {
  reply: string;
}

interface ReviewClientView {
  id: string;
  name: string;
  profilePhotoUrl: string | null;
}

interface ReviewView {
  id: string;
  projectId: string | null;
  equipmentBookingId: string | null;
  equipmentId: string | null;
  client: ReviewClientView;
  rating: number;
  reviewText: string;
  engineerReply: string | null;
  engineerRepliedAt: string | null;
  createdAt: string;
}

interface ReviewListResponse {
  reviews: ReviewView[];
  averageRating: number;
  totalReviews: number;
}

const createReviewError = (
  message: string,
  statusCode: number,
): ReviewError => {
  const error = new Error(message) as ReviewError;
  error.statusCode = statusCode;
  return error;
};

const getUserId = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId) {
    throw createReviewError("Authentication required", 401);
  }
  return req.user.userId;
};

const getParams = (req: AuthenticatedRequest): ReviewParams =>
  req.params as unknown as ReviewParams;

const isCompleteAndPaid = async (
  projectId: Types.ObjectId,
  paymentPlan: string | null | undefined,
  fullPaymentPaid: boolean,
): Promise<boolean> => {
  const phases = await ProjectPhase.find({ project: projectId })
    .sort({ order: 1 })
    .exec();

  if (
    phases.length === 0 ||
    phases.some((phase) => phase.status !== "completed")
  ) {
    return false;
  }

  if (paymentPlan === "phase_by_phase") {
    return phases.every((phase) => phase.paymentStatus === "paid");
  }

  return paymentPlan === "full_upfront" && fullPaymentPaid;
};

const toReviewView = (review: IReview): ReviewView => {
  const client = review.client as unknown as {
    _id: Types.ObjectId;
    name: string;
    profilePhotoUrl?: string | null;
  };

  const bookingRef = review.equipmentBooking as
    | Types.ObjectId
    | {
        _id: Types.ObjectId;
        equipment?: Types.ObjectId | { _id: Types.ObjectId };
      }
    | undefined;

  const equipmentBookingId =
    bookingRef instanceof Types.ObjectId
      ? bookingRef.toString()
      : (bookingRef?._id?.toString() ?? null);

  const equipmentValue =
    bookingRef && !(bookingRef instanceof Types.ObjectId)
      ? bookingRef.equipment
      : undefined;
  const equipmentId =
    equipmentValue instanceof Types.ObjectId
      ? equipmentValue.toString()
      : equipmentValue && typeof equipmentValue === "object"
        ? (equipmentValue._id?.toString() ?? null)
        : null;

  return {
    id: review._id.toString(),
    projectId: review.project?.toString() ?? null,
    equipmentBookingId,
    equipmentId,
    client: {
      id: client._id.toString(),
      name: client.name,
      profilePhotoUrl: client.profilePhotoUrl ?? null,
    },
    rating: review.rating,
    reviewText: review.reviewText,
    engineerReply: review.engineerReply ?? null,
    engineerRepliedAt: review.engineerRepliedAt?.toISOString() ?? null,
    createdAt: review.createdAt.toISOString(),
  };
};

export const canReviewProject = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (req.user.role !== "client") {
      throw createReviewError("Client access required", 403);
    }

    const { projectId } = getParams(req);
    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      throw createReviewError("Project not found", 404);
    }

    const project = await Project.findById(projectId).exec();
    if (!project) throw createReviewError("Project not found", 404);
    if (project.client?.toString() !== userId) {
      throw createReviewError("You do not own this project", 403);
    }

    const existingReview = await Review.findOne({
      project: project._id,
      client: userId,
    })
      .populate("client", "name")
      .exec();
    if (existingReview) {
      res.json({
        canReview: false,
        alreadyReviewed: true,
        reason: "Already reviewed",
        review: toReviewView(existingReview),
      });
      return;
    }

    const complete = await isCompleteAndPaid(
      project._id,
      project.paymentPlan,
      project.fullPaymentPaid,
    );
    res.json(
      complete
        ? { canReview: true, alreadyReviewed: false }
        : {
            canReview: false,
            alreadyReviewed: false,
            reason: "Project not yet fully complete",
          },
    );
  } catch (error: unknown) {
    next(error);
  }
};

const isBookingCompleteAndDepositResolved = (booking: {
  status: string;
  depositResolution: string;
}): boolean =>
  booking.status === "completed" && booking.depositResolution !== "pending";

export const canReviewBooking = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);

    const { bookingId } = getParams(req);
    if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
      throw createReviewError("Booking not found", 404);
    }

    const booking = await EquipmentBooking.findById(bookingId)
      .populate("equipment", "title")
      .exec();
    if (!booking) throw createReviewError("Booking not found", 404);
    if (booking.renter.toString() !== userId) {
      throw createReviewError("You do not own this booking", 403);
    }

    const existingReview = await Review.findOne({
      equipmentBooking: booking._id,
      client: userId,
    })
      .populate("client", "name")
      .populate({ path: "equipmentBooking", select: "equipment" })
      .exec();

    if (existingReview) {
      res.json({
        canReview: false,
        alreadyReviewed: true,
        reason: "Already reviewed",
        review: toReviewView(existingReview),
      });
      return;
    }

    if (booking.status !== "completed") {
      res.json({
        canReview: false,
        alreadyReviewed: false,
        reason: "Booking is not completed yet",
      });
      return;
    }

    if (booking.depositResolution === "pending") {
      res.json({
        canReview: false,
        alreadyReviewed: false,
        reason: "Deposit must be resolved before leaving a review",
      });
      return;
    }

    res.json({ canReview: true, alreadyReviewed: false });
  } catch (error: unknown) {
    next(error);
  }
};

export const createReview = async (
  req: AuthenticatedRequest<CreateReviewRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (req.user.role !== "client") {
      throw createReviewError("Client access required", 403);
    }

    const { projectId, rating, reviewText } = req.body;
    if (!projectId || !Types.ObjectId.isValid(projectId)) {
      throw createReviewError("Valid project ID is required", 400);
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw createReviewError("Rating must be an integer from 1 to 5", 400);
    }
    if (!reviewText?.trim() || reviewText.length > 1000) {
      throw createReviewError(
        "Review text is required and must be 1000 characters or fewer",
        400,
      );
    }

    const project = await Project.findById(projectId).exec();
    if (!project) throw createReviewError("Project not found", 404);
    if (project.client?.toString() !== userId) {
      throw createReviewError("You do not own this project", 403);
    }
    if (!project.assignedEngineer) {
      throw createReviewError("This project has no assigned engineer", 409);
    }
    if (
      !(await isCompleteAndPaid(
        project._id,
        project.paymentPlan,
        project.fullPaymentPaid,
      ))
    ) {
      throw createReviewError("Project not yet fully complete", 409);
    }
    if (await Review.exists({ project: project._id, client: userId })) {
      throw createReviewError("Already reviewed", 409);
    }

    const review = await Review.create({
      project: project._id,
      client: userId,
      engineer: project.assignedEngineer,
      rating,
      reviewText: reviewText.trim(),
    });
    await review.populate("client", "name");

    await Notification.create({
      recipient: project.assignedEngineer,
      type: "review_received",
      message: `You received a ${rating}-star review for ${project.title ?? project.name ?? "your project"}.`,
      project: project._id,
    });

    res.status(201).json({ review: toReviewView(review) });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      next(createReviewError("Already reviewed", 409));
      return;
    }
    next(error);
  }
};

export const createEquipmentReview = async (
  req: AuthenticatedRequest<CreateEquipmentReviewRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);

    const { bookingId, rating, reviewText } = req.body;
    if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
      throw createReviewError("Valid booking ID is required", 400);
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw createReviewError("Rating must be an integer from 1 to 5", 400);
    }
    if (!reviewText?.trim() || reviewText.length > 1000) {
      throw createReviewError(
        "Review text is required and must be 1000 characters or fewer",
        400,
      );
    }

    const booking = await EquipmentBooking.findById(bookingId)
      .populate("equipment", "title")
      .exec();
    if (!booking) throw createReviewError("Booking not found", 404);
    if (booking.renter.toString() !== userId) {
      throw createReviewError("You do not own this booking", 403);
    }
    if (!isBookingCompleteAndDepositResolved(booking)) {
      throw createReviewError(
        "Booking must be completed and deposit resolved before review",
        409,
      );
    }
    if (
      await Review.exists({ equipmentBooking: booking._id, client: userId })
    ) {
      throw createReviewError("Already reviewed", 409);
    }

    const review = await Review.create({
      equipmentBooking: booking._id,
      client: userId,
      engineer: booking.owner,
      rating,
      reviewText: reviewText.trim(),
    });
    await review.populate("client", "name");
    await review.populate({ path: "equipmentBooking", select: "equipment" });

    const populatedEquipment = booking.equipment as
      | Types.ObjectId
      | { _id: Types.ObjectId; title?: string }
      | undefined;
    const equipmentId =
      populatedEquipment instanceof Types.ObjectId
        ? populatedEquipment
        : populatedEquipment?._id;
    const equipmentTitle =
      populatedEquipment instanceof Types.ObjectId
        ? "your equipment listing"
        : (populatedEquipment?.title ?? "your equipment listing");

    await Notification.create({
      recipient: booking.owner,
      type: "review_received",
      message: `You received a ${rating}-star equipment review for ${equipmentTitle}.`,
      equipment: equipmentId,
      equipmentBooking: booking._id,
    });

    res.status(201).json({ review: toReviewView(review) });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      next(createReviewError("Already reviewed", 409));
      return;
    }
    next(error);
  }
};

export const replyToReview = async (
  req: AuthenticatedRequest<ReplyToReviewRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (req.user.role !== "engineer") {
      throw createReviewError("Engineer access required", 403);
    }

    const { reviewId } = getParams(req);
    if (!reviewId || !Types.ObjectId.isValid(reviewId)) {
      throw createReviewError("Review not found", 404);
    }
    const reply = req.body.reply?.trim();
    if (!reply || reply.length > 500) {
      throw createReviewError(
        "Reply is required and must be 500 characters or fewer",
        400,
      );
    }

    const review = await Review.findById(reviewId).exec();
    if (!review) throw createReviewError("Review not found", 404);
    if (review.engineer.toString() !== userId) {
      throw createReviewError("You do not own this review", 403);
    }

    review.engineerReply = reply;
    review.engineerRepliedAt = new Date();
    await review.save();
    await review.populate("client", "name");
    await review.populate({ path: "equipmentBooking", select: "equipment" });

    const notificationPayload: {
      recipient: Types.ObjectId;
      type: "review_reply";
      message: string;
      project?: Types.ObjectId;
      equipmentBooking?: Types.ObjectId;
      equipment?: Types.ObjectId;
    } = {
      recipient: review.client,
      type: "review_reply",
      message: review.project
        ? "An engineer replied to your project review."
        : "An equipment owner replied to your review.",
    };

    if (review.project) {
      notificationPayload.project = review.project;
    }

    const bookingRef = review.equipmentBooking as
      | Types.ObjectId
      | { _id: Types.ObjectId; equipment?: Types.ObjectId }
      | undefined;
    if (bookingRef) {
      notificationPayload.equipmentBooking =
        bookingRef instanceof Types.ObjectId ? bookingRef : bookingRef._id;
      if (!(bookingRef instanceof Types.ObjectId) && bookingRef.equipment) {
        notificationPayload.equipment = bookingRef.equipment;
      }
    }

    await Notification.create(notificationPayload);

    res.json({ review: toReviewView(review) });
  } catch (error: unknown) {
    next(error);
  }
};

export const getEquipmentReviews = async (
  req: AuthenticatedRequest,
  res: Response<ReviewListResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    getUserId(req);
    const { equipmentId } = getParams(req);
    if (!equipmentId || !Types.ObjectId.isValid(equipmentId)) {
      throw createReviewError("Equipment not found", 404);
    }

    const reviews = await Review.find({
      equipmentBooking: { $exists: true, $ne: null },
    })
      .populate("client", "name")
      .populate({
        path: "equipmentBooking",
        select: "equipment",
        match: { equipment: new Types.ObjectId(equipmentId) },
      })
      .sort({ createdAt: -1 })
      .exec();

    const filtered = reviews.filter(
      (review) =>
        review.equipmentBooking &&
        !(review.equipmentBooking instanceof Types.ObjectId),
    );

    const totalReviews = filtered.length;
    const averageRating =
      totalReviews === 0
        ? 0
        : Math.round(
            (filtered.reduce((sum, review) => sum + review.rating, 0) /
              totalReviews) *
              10,
          ) / 10;

    res.json({
      reviews: filtered.map(toReviewView),
      averageRating,
      totalReviews,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const getEngineerReviews = async (
  req: AuthenticatedRequest,
  res: Response<ReviewListResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    getUserId(req);
    const { engineerUserId } = getParams(req);
    if (!engineerUserId || !Types.ObjectId.isValid(engineerUserId)) {
      throw createReviewError("Engineer not found", 404);
    }

    const engineer = await User.findOne({
      _id: engineerUserId,
      role: "engineer",
    }).exec();
    if (!engineer) throw createReviewError("Engineer not found", 404);

    const reviews = await Review.find({
      engineer: engineer._id,
      project: { $exists: true, $ne: null },
    })
      .populate("client", "name")
      .sort({ createdAt: -1 })
      .exec();
    const totalReviews = reviews.length;
    const averageRating =
      totalReviews === 0
        ? 0
        : Math.round(
            (reviews.reduce((sum, review) => sum + review.rating, 0) /
              totalReviews) *
              10,
          ) / 10;

    res.json({
      reviews: reviews.map(toReviewView),
      averageRating,
      totalReviews,
    });
  } catch (error: unknown) {
    next(error);
  }
};
