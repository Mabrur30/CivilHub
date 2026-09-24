import { Document, Model, Schema, Types, model } from "mongoose";

export type MessageType = "text" | "file" | "audio";

export interface IMessage extends Document {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  messageType: MessageType;
  content?: string;
  attachmentUrl?: string;
  attachmentPublicId?: string;
  attachmentName?: string;
  attachmentMimeType?: string;
  attachmentSize?: number;
  durationSeconds?: number;
  readBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    messageType: {
      type: String,
      enum: ["text", "file", "audio"],
      default: "text",
      required: true,
    },
    content: {
      type: String,
      required: function (this: IMessage) {
        return this.messageType === "text";
      },
      trim: true,
      maxlength: 4000,
    },
    attachmentUrl: {
      type: String,
      required: function (this: IMessage) {
        return this.messageType !== "text";
      },
      trim: true,
    },
    attachmentPublicId: {
      type: String,
      required: false,
      trim: true,
    },
    attachmentName: {
      type: String,
      required: false,
      trim: true,
      maxlength: 255,
    },
    attachmentMimeType: {
      type: String,
      required: false,
      trim: true,
    },
    attachmentSize: {
      type: Number,
      required: false,
      min: 0,
    },
    durationSeconds: {
      type: Number,
      required: false,
      min: 0,
    },
    readBy: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

messageSchema.index({ conversation: 1, createdAt: 1 });

export const Message: Model<IMessage> = model<IMessage>(
  "Message",
  messageSchema,
);

export default Message;
