import mongoose, { Document, Model, Schema } from "mongoose";

export interface IProject extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  owner: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

ProjectSchema.index({ owner: 1 });
ProjectSchema.index({ members: 1 });
ProjectSchema.index({ _id: 1, updatedAt: -1 });

const Project: Model<IProject> =
  mongoose.models.Project ?? mongoose.model<IProject>("Project", ProjectSchema);

export default Project;
