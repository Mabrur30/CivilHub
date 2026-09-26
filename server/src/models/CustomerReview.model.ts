import { Document, Model, Schema, Types, model } from "mongoose";

/**
 * A provider's review of the person they worked for: an engineer or company
 * rating the client after a project, or an equipment owner rating the renter
 * after a rental. Reviews the other way round live in Review.
 */
export interface ICustomerReview extends Document {
  project?: Types.ObjectId;
  equipmentBooking?: Types.ObjectId;
  /** The engineer, company or equipment owner who wrote it. */
  author: Types.ObjectId;
  /** The client or renter it is about. */
  subject: Types.ObjectId;
  rating: number;
  reviewText: string;
  createdAt: Date;
  updatedAt: Date;
}

const customerReviewSchema = new Schema<ICustomerReview>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    equipmentBooking: {
      type: Schema.Types.ObjectId,
      ref: "EquipmentBooking",
      index: true,
    },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    reviewText: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);

customerReviewSchema.index(
  { project: 1, author: 1 },
  { unique: true, partialFilterExpression: { project: { $exists: true } } },
);
customerReviewSchema.index(
  { equipmentBooking: 1, author: 1 },
  { unique: true, partialFilterExpression: { equipmentBooking: { $exists: true } } },
);

customerReviewSchema.pre("validate", function () {
  if (Boolean(this.project) === Boolean(this.equipmentBooking)) {
    this.invalidate(
      "project",
      "A customer review is for exactly one project or equipment booking",
    );
  }
});

export const CustomerReview: Model<ICustomerReview> = model<ICustomerReview>(
  "CustomerReview",
  customerReviewSchema,
);
export default CustomerReview;
