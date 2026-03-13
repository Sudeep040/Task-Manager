import mongoose, { Document, Model, Schema } from "mongoose";

export type TaskStatus = "todo" | "in_progress" | "done" | "archived";

export interface IAttachment {
  url: string;
  key: string;
  filename: string;
  fileType: "image" | "video";
  fileSize: number;
}

export interface ITask extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  status: TaskStatus;
  assignees: mongoose.Types.ObjectId[];
  priority: number;
  commentCount: number;
  lastCommentAt?: Date;
  attachments: IAttachment[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: ["todo", "in_progress", "done", "archived"],
      default: "todo",
    },
    assignees: [{ type: Schema.Types.ObjectId, ref: "User" }],
    priority: { type: Number, default: 3, min: 1, max: 5 },
    commentCount: { type: Number, default: 0 },
    lastCommentAt: { type: Date },
    dueAt: { type: Date },
    attachments: {
      type: [
        {
          url: { type: String, required: true },
          key: { type: String, required: true },
          filename: { type: String, required: true },
          fileType: { type: String, enum: ["image", "video"], required: true },
          fileSize: { type: Number, required: true },
        },
      ],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Compound indexes for dashboard queries
// Include `_id` as a tiebreaker to match pagination sort `{ updatedAt: -1, _id: -1 }`
TaskSchema.index({ projectId: 1, status: 1, updatedAt: -1, _id: -1 });
TaskSchema.index({ projectId: 1, assignees: 1, updatedAt: -1, _id: -1 });
TaskSchema.index({ projectId: 1, updatedAt: -1, _id: -1 });

// Text index for search across title and description
TaskSchema.index({ title: "text", description: "text" });

const Task: Model<ITask> =
  mongoose.models.Task ?? mongoose.model<ITask>("Task", TaskSchema);

export default Task;
