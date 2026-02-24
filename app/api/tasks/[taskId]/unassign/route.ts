import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Task from "@/lib/db/models/Task";
import Project from "@/lib/db/models/Project";
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

  // Only the task creator can unassign users
  if (!task.createdBy || task.createdBy.toString() !== authUser.userId) {
    throw new ApiError(403, "Only the task creator can unassign users from this task", "FORBIDDEN");
  }

  if (!mongoose.isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid user ID", "INVALID_ID");
  }

  task.assignees = task.assignees.filter((a) => a.toString() !== userId);
  await task.save();

  const populated = await task.populate([
    { path: "assignees", select: "name email" },
    { path: "createdBy", select: "name email" },
  ]);
  await emitToProject(task.projectId.toString(), EVENTS.TASK_UPDATED, populated.toObject());

  return apiSuccess(populated);
});
