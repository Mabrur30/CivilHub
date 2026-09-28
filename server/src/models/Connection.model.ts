import { Document, Model, Schema, Types, model } from "mongoose";

export type ConnectionStatus = "pending" | "accepted" | "declined";

export interface IConnection extends Document {
  requester: Types.ObjectId;
  recipient: Types.ObjectId;
  /** Both user ids sorted and joined, so a pair has one record either way round. */
  pairKey?: string;
  status: ConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const connectionSchema = new Schema<IConnection>(
  {
    requester: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pairKey: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      required: true,
      default: "pending",
    },
  },
  { timestamps: true },
);

connectionSchema.index({ requester: 1, recipient: 1 }, { unique: true });
// Stops A→B and B→A requests racing into two records. Partial so records
// saved before pairKey existed don't clash until the startup backfill runs.
connectionSchema.index(
  { pairKey: 1 },
  { unique: true, partialFilterExpression: { pairKey: { $type: "string" } } },
);

export const connectionPairKey = (
  first: Types.ObjectId | string,
  second: Types.ObjectId | string,
): string => [first.toString(), second.toString()].sort().join(":");

connectionSchema.pre("validate", function setPairKey() {
  if (this.requester && this.recipient) {
    this.pairKey = connectionPairKey(this.requester, this.recipient);
  }
});

export const Connection: Model<IConnection> = model<IConnection>(
  "Connection",
  connectionSchema,
);
export default Connection;
