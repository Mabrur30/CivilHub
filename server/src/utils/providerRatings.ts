import { Types } from "mongoose";
import { Review } from "../models/Review.model";

export interface RatingSummary {
  rating: number | null;
  count: number;
}

export interface ProviderRatings {
  project: RatingSummary;
  equipment: RatingSummary;
  /**
   * The rating to lead with: project work when there is any, otherwise
   * equipment rentals, so a plant-hire firm isn't shown as unreviewed.
   */
  headline: RatingSummary & { kind: "project" | "equipment" | null };
}

const EMPTY: RatingSummary = { rating: null, count: 0 };

const round = (value: number): number => Math.round(value * 10) / 10;

export const headlineOf = (
  project: RatingSummary,
  equipment: RatingSummary,
): ProviderRatings["headline"] =>
  project.count > 0
    ? { ...project, kind: "project" }
    : equipment.count > 0
      ? { ...equipment, kind: "equipment" }
      : { ...EMPTY, kind: null };

/** What clients and renters rated an engineer or company, split by kind. */
export const getProviderRatings = async (
  userId: string,
): Promise<ProviderRatings> => {
  if (!Types.ObjectId.isValid(userId)) {
    return { project: EMPTY, equipment: EMPTY, headline: headlineOf(EMPTY, EMPTY) };
  }

  const rows = await Review.aggregate<{
    _id: "project" | "equipment";
    averageRating: number;
    count: number;
  }>([
    { $match: { engineer: new Types.ObjectId(userId) } },
    {
      $group: {
        _id: {
          $cond: [{ $ifNull: ["$project", false] }, "project", "equipment"],
        },
        averageRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]).exec();

  const summary = (kind: "project" | "equipment"): RatingSummary => {
    const row = rows.find((item) => item._id === kind);
    return row ? { rating: round(row.averageRating), count: row.count } : EMPTY;
  };
  const project = summary("project");
  const equipment = summary("equipment");
  return { project, equipment, headline: headlineOf(project, equipment) };
};
