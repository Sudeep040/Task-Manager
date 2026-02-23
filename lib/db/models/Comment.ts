import mongoose, { Document, Model, Schema } from "mongoose";

export interface IComment extends Document {
  _id: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

CommentSchema.index({ taskId: 1, createdAt: -1 });
CommentSchema.index({ authorId: 1 });

// Text index for global search
CommentSchema.index({ body: "text" });

const Comment: Model<IComment> =
  mongoose.models.Comment ?? mongoose.model<IComment>("Comment", CommentSchema);

export default Comment;
