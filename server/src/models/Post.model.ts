import { Document, Model, Schema, Types, model } from "mongoose";

export interface IPost extends Document {
  author: Types.ObjectId;
  content: string;
  imageUrl?: string;
  imagePublicId?: string;
  likes: Types.ObjectId[];
  originalPost?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const postSchema = new Schema<IPost>(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    imageUrl: {
      type: String,
      required: false,
    },
    imagePublicId: {
      type: String,
      required: false,
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    originalPost: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: false,
    },
  },
  { timestamps: true },
);

postSchema.index({ author: 1, createdAt: -1 });

export const Post: Model<IPost> = model<IPost>("Post", postSchema);
export default Post;
