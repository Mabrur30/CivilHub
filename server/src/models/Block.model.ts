import { Document, Model, Schema, Types, model } from "mongoose";

/** One person blocking another. Blocks are one-way records but act both ways. */
export interface IBlock extends Document {
  blocker: Types.ObjectId;
  blocked: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const blockSchema = new Schema<IBlock>(
  {
    blocker: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    blocked: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true },
);

blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

export const Block: Model<IBlock> = model<IBlock>("Block", blockSchema);
export default Block;
