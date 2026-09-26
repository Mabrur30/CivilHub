import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  CustomerReview,
  type ICustomerReview,
} from "../models/CustomerReview.model";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { Project } from "../models/Project.model";
import { User, type UserRole } from "../models/User.model";
import { getProfilePhotoMap } from "../utils/profilePhotos";
import { isProjectFullyComplete } from "./projectProgress.controller";
import { isBookingCompleteAndDepositResolved } from "./review.controller";

interface CustomerReviewError extends Error {
  statusCode: number;
}

export interface CreateCustomerReviewBody {
  projectId?: string;
  bookingId?: string;
  rating?: number;
  reviewText?: string;
}

/** A provider's review of a client or renter, as their profile shows it. */
export interface CustomerReviewView {
  id: string;
  rating: number;
  reviewText: string;
  createdAt: string;
  context: "project" | "rental";
  /** The project or the rented listing. */
  title: string;
  author: {
    id: string;
    name: string;
    role: UserRole;
    profilePhotoUrl: string | null;
  };
}

const createError = (message: string, statusCode: number): CustomerReviewError => {
  const error = new Error(message) as CustomerReviewError;
  error.statusCode = statusCode;
  return error;
};

const round = (value: number): number => Math.round(value * 10) / 10;

/** Average and count of what providers said about this customer. */
export const getCustomerRating = async (
  userId: string | Types.ObjectId,
): Promise<{ rating: number | null; reviewCount: number }> => {
  const rows = await CustomerReview.aggregate<{ average: number; count: number }>([
    { $match: { subject: new Types.ObjectId(userId.toString()) } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]).exec();
  return rows[0]
    ? { rating: round(rows[0].average), reviewCount: rows[0].count }
    : { rating: null, reviewCount: 0 };
};

export const toCustomerReviewViews = async (
  reviews: ICustomerReview[],
): Promise<CustomerReviewView[]> => {
  const authorIds = reviews.map((review) => review.author);
  const [authors, photos, projects, bookings] = await Promise.all([
    User.find({ _id: { $in: authorIds } }).select("name role").exec(),
    getProfilePhotoMap(authorIds),
    Project.find({
      _id: { $in: reviews.flatMap((review) => (review.project ? [review.project] : [])) },
    })
      .select("title name")
      .exec(),
    EquipmentBooking.find({
      _id: {
        $in: reviews.flatMap((review) =>
          review.equipmentBooking ? [review.equipmentBooking] : [],
        ),
      },
    })
      .populate("equipment", "title")
      .select("equipment")
      .exec(),
  ]);

  return reviews.map((review) => {
    const author = authors.find((user) => user._id.equals(review.author));
    const project = review.project
      ? projects.find((item) => item._id.equals(review.project))
      : undefined;
    const booking = review.equipmentBooking
      ? bookings.find((item) => item._id.equals(review.equipmentBooking))
      : undefined;
    const listing = booking?.equipment as unknown as { title?: string } | undefined;
    return {
      id: review._id.toString(),
      rating: review.rating,
      reviewText: review.reviewText,
      createdAt: review.createdAt.toISOString(),
      context: review.project ? "project" : "rental",
      title: review.project
        ? (project?.title ?? project?.name ?? "A project")
        : (listing?.title ?? "An equipment rental"),
      author: {
        id: review.author.toString(),
        name: author?.name ?? "A CivilHub member",
        role: author?.role ?? "engineer",
        profilePhotoUrl: photos.get(review.author.toString()) ?? null,
      },
    };
  });
};

const readRating = (body: CreateCustomerReviewBody): { rating: number; reviewText: string } => {
  const { rating, reviewText } = body;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw createError("Rating must be a whole number from 1 to 5", 400);
  }
  const text = typeof reviewText === "string" ? reviewText.trim() : "";
  if (!text || text.length > 1000) {
    throw createError("Review text is required and must be 1000 characters or fewer", 400);
  }
  return { rating, reviewText: text };
};

/**
 * The engineer or company rates the client after a finished project, or the
 * equipment owner rates the renter after a finished rental.
 */
export const createCustomerReview = async (
  req: AuthenticatedRequest<CreateCustomerReviewBody>,
  res: Response<{ review: CustomerReviewView }>,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId) throw createError("Authentication required", 401);
    const userId = req.user.userId;
    const { projectId, bookingId } = req.body;
    if (Boolean(projectId) === Boolean(bookingId)) {
      throw createError("Say which project or booking this review is for", 400);
    }
    const { rating, reviewText } = readRating(req.body);

    let subject: Types.ObjectId;
    let ref: { project: Types.ObjectId } | { equipmentBooking: Types.ObjectId };
    let about: string;
    let notificationRef: Record<string, Types.ObjectId>;

    if (projectId) {
      if (!Types.ObjectId.isValid(projectId)) throw createError("Project not found", 404);
      const project = await Project.findById(projectId).exec();
      if (!project || !project.client) throw createError("Project not found", 404);
      if (project.assignedEngineer?.toString() !== userId) {
        throw createError("Only whoever delivered this project can review the client", 403);
      }
      if (!(await isProjectFullyComplete(project))) {
        throw createError("You can review the client once the project is complete", 409);
      }
      subject = project.client;
      ref = { project: project._id };
      about = project.title ?? project.name ?? "your project";
      notificationRef = { project: project._id };
    } else {
      if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
        throw createError("Booking not found", 404);
      }
      const booking = await EquipmentBooking.findById(bookingId)
        .populate("equipment", "title")
        .exec();
      if (!booking) throw createError("Booking not found", 404);
      if (booking.owner.toString() !== userId) {
        throw createError("Only the equipment owner can review the renter", 403);
      }
      if (!isBookingCompleteAndDepositResolved(booking)) {
        throw createError(
          "You can review the renter once the rental is complete and the deposit is settled",
          409,
        );
      }
      const listing = booking.equipment as unknown as { _id: Types.ObjectId; title?: string };
      subject = booking.renter;
      ref = { equipmentBooking: booking._id };
      about = listing?.title ?? "your rental";
      notificationRef = { equipmentBooking: booking._id, equipment: listing._id };
    }

    if (await CustomerReview.exists({ ...ref, author: userId })) {
      throw createError("You've already reviewed this", 409);
    }

    const review = await CustomerReview.create({
      ...ref,
      author: userId,
      subject,
      rating,
      reviewText,
    });

    const author = await User.findById(userId).select("name").exec();
    await Notification.create({
      recipient: subject,
      type: "customer_review_received",
      message: `${author?.name ?? "Someone you worked with"} gave you ${rating} ${rating === 1 ? "star" : "stars"} for ${about}.`,
      ...notificationRef,
    });

    const [view] = await toCustomerReviewViews([review]);
    res.status(201).json({ review: view });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      next(createError("You've already reviewed this", 409));
      return;
    }
    next(error);
  }
};

/** What providers said about this person as a client or renter. */
export const getCustomerReviews = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId) throw createError("Authentication required", 401);
    const { userId } = req.params as { userId?: string };
    if (!userId || !Types.ObjectId.isValid(userId)) throw createError("User not found", 404);

    const reviews = await CustomerReview.find({ subject: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
    const { rating, reviewCount } = await getCustomerRating(userId);
    res.status(200).json({
      reviews: await toCustomerReviewViews(reviews),
      averageRating: rating ?? 0,
      totalReviews: reviewCount,
    });
  } catch (error: unknown) {
    next(error);
  }
};
