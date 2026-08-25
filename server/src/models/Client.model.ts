import { Document, Model, Schema, Types, model } from "mongoose";

export interface IClient extends Document {
  user: Types.ObjectId;
  phone?: string;
  companyName?: string;
  bio?: string;
  createdAt: Date;
  updatedAt: Date;
}

const clientSchema = new Schema<IClient>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    companyName: {
      type: String,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

export const Client: Model<IClient> = model<IClient>("Client", clientSchema);
export default Client;
