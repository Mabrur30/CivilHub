import { Document, Model, Schema, Types, model } from "mongoose";

export interface IReview extends Document {
  project?: Types.ObjectId;
  equipmentBooking?: Types.ObjectId;
  client: Types.ObjectId;
  engineer: Types.ObjectId;
  rating: number;
  reviewText: string;
  engineerReply?: string;
  engineerRepliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: false,
      index: true,
    },
    equipmentBooking: {
      type: Schema.Types.ObjectId,
      ref: "EquipmentBooking",
      required: false,
      index: true,
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    engineer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    reviewText: {
      type: String,
      required: true,
      maxlength: 1000,
      trim: true,
    },
    engineerReply: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    engineerRepliedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

reviewSchema.index(
  { project: 1, client: 1 },
  {
    unique: true,
    partialFilterExpression: {
      project: { $exists: true, $ne: null },
    },
  },
);

reviewSchema.index(
  { equipmentBooking: 1, client: 1 },
  {
    unique: true,
    partialFilterExpression: {
      equipmentBooking: { $exists: true, $ne: null },
    },
  },
);

reviewSchema.pre("validate", function () {
  const hasProject = Boolean(this.project);
  const hasEquipmentBooking = Boolean(this.equipmentBooking);

  if (hasProject === hasEquipmentBooking) {
    this.invalidate(
      "project",
      "Review must reference exactly one of project or equipmentBooking",
    );
  }
});

export const Review: Model<IReview> = model<IReview>("Review", reviewSchema);
export default Review;
