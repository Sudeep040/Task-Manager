import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Task from "@/lib/db/models/Task";
import Project from "@/lib/db/models/Project";
import User from "@/lib/db/models/User";
import { assignSchema } from "@/lib/validation/task.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth } from "@/lib/api-helpers";
import { emitToProject } from "@/lib/socket/emitter";
import { EVENTS } from "@/lib/socket/events";

interface Params {
  params: Promise<{ taskId: string }>;
}

export const POST = withAuth(async (req: NextRequest, { params }: Params) => {
  const authUser = getAuthUser(req);
  const { taskId } = await params;

  if (!mongoose.isValidObjectId(taskId)) {
    throw new ApiError(400, "Invalid task ID", "INVALID_ID");
  }

  const task = await Task.findById(taskId);
  if (!task) throw new ApiError(404, "Task not found", "NOT_FOUND");

  const project = await Project.findById(task.projectId);
  if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");

  const isMember =
    project.owner.toString() === authUser.userId ||
    project.members.some((m) => m.toString() === authUser.userId);
  if (!isMember) throw new ApiError(403, "Access denied", "FORBIDDEN");

  const body = await req.json();
  const { userId } = assignSchema.parse(body);

  // Only the task creator can assign users
  if (!task.createdBy || task.createdBy.toString() !== authUser.userId) {
    throw new ApiError(403, "Only the task creator can assign users to this task", "FORBIDDEN");
  }

  if (!mongoose.isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid user ID", "INVALID_ID");
  }

  const targetUser = await User.findById(userId);
  if (!targetUser) throw new ApiError(404, "User not found", "NOT_FOUND");

  const isProjectMember =
    project.owner.toString() === userId ||
    project.members.some((m) => m.toString() === userId);
  if (!isProjectMember) {
    throw new ApiError(400, "User is not a project member", "NOT_PROJECT_MEMBER");
  }

  const alreadyAssigned = task.assignees.some((a) => a.toString() === userId);
  if (alreadyAssigned) throw new ApiError(409, "User already assigned", "ALREADY_ASSIGNED");

  task.assignees.push(new mongoose.Types.ObjectId(userId));
  await task.save();

  const populated = await task.populate([
    { path: "assignees", select: "name email" },
    { path: "createdBy", select: "name email" },
  ]);
  await emitToProject(task.projectId.toString(), EVENTS.TASK_UPDATED, populated.toObject());

  return apiSuccess(populated);
});
