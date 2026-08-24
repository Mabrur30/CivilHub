import { Document, Model, Schema, Types, model } from "mongoose";

export interface IConversation extends Document {
  participants: [Types.ObjectId, Types.ObjectId];
  pairKey: string;
  lastMessage?: Types.ObjectId;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    participants: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      ],
      required: true,
      validate: {
        validator: (value: Types.ObjectId[]) => value.length === 2,
        message: "A conversation must have exactly two participants",
      },
      index: true,
    },
    pairKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      required: false,
    },
    lastMessageAt: {
      type: Date,
      required: false,
      index: true,
    },
  },
  { timestamps: true },
);

export const Conversation: Model<IConversation> = model<IConversation>(
  "Conversation",
  conversationSchema,
);

export default Conversation;
