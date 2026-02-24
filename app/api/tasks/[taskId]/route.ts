import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Task from "@/lib/db/models/Task";
import Project from "@/lib/db/models/Project";
import { updateTaskSchema } from "@/lib/validation/task.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth } from "@/lib/api-helpers";
import { emitToProject } from "@/lib/socket/emitter";
import { EVENTS } from "@/lib/socket/events";

interface Params {
  params: Promise<{ taskId: string }>;
}

async function getTaskAndVerifyAccess(taskId: string, userId: string) {
  if (!mongoose.isValidObjectId(taskId)) {
    throw new ApiError(400, "Invalid task ID", "INVALID_ID");
  }
  const task = await Task.findById(taskId);
  if (!task) throw new ApiError(404, "Task not found", "NOT_FOUND");

  const project = await Project.findById(task.projectId);
  if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");

  const isMember =
    project.owner.toString() === userId ||
    project.members.some((m) => m.toString() === userId);
  if (!isMember) throw new ApiError(403, "Access denied", "FORBIDDEN");

  return { task, project };
}

export const GET = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { taskId } = await params;
  const { task } = await getTaskAndVerifyAccess(taskId, user.userId);

  const populated = await task.populate([
    { path: "assignees", select: "name email" },
    { path: "createdBy", select: "name email" },
  ]);

  return apiSuccess(populated);
});

export const PATCH = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { taskId } = await params;
  const { task } = await getTaskAndVerifyAccess(taskId, user.userId);

  const body = await req.json();
  const updates = updateTaskSchema.parse(body);

  if (updates.title !== undefined) task.title = updates.title;
  if (updates.description !== undefined) task.description = updates.description;
  if (updates.status !== undefined) task.status = updates.status;
  if (updates.priority !== undefined) task.priority = updates.priority;
  if (updates.assignees !== undefined) {
    task.assignees = updates.assignees.map((id) => new mongoose.Types.ObjectId(id));
  }

  await task.save();

  const populated = await task.populate([
    { path: "assignees", select: "name email" },
    { path: "createdBy", select: "name email" },
  ]);

  await emitToProject(task.projectId.toString(), EVENTS.TASK_UPDATED, populated.toObject());

  return apiSuccess(populated);
});

export const DELETE = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { taskId } = await params;
  const { task } = await getTaskAndVerifyAccess(taskId, user.userId);

  const projectId = task.projectId.toString();
  await task.deleteOne();

  await emitToProject(projectId, EVENTS.TASK_DELETED, { taskId });

  return apiSuccess({ deleted: true });
});
