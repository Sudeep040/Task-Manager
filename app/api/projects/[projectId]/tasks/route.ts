import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Project from "@/lib/db/models/Project";
import Task from "@/lib/db/models/Task";
import { createTaskSchema } from "@/lib/validation/task.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth } from "@/lib/api-helpers";
import { emitToProject } from "@/lib/socket/emitter";
import { EVENTS } from "@/lib/socket/events";

interface Params {
  params: Promise<{ projectId: string }>;
}

export const POST = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { projectId } = await params;

  if (!mongoose.isValidObjectId(projectId)) {
    throw new ApiError(400, "Invalid project ID", "INVALID_ID");
  }

  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");

  const isMember =
    project.owner.toString() === user.userId ||
    project.members.some((m) => m.toString() === user.userId);
  if (!isMember) throw new ApiError(403, "Access denied", "FORBIDDEN");

  const body = await req.json();
  const data = createTaskSchema.parse(body);

  const assignees = (data.assignees ?? []).map((id: string) => new mongoose.Types.ObjectId(id));
  const dueAt = data.dueAt ? new Date(data.dueAt) : undefined;

  const task = await Task.create({
    title: data.title,
    description: data.description,
    status: data.status,
    assignees,
    priority: data.priority,
    dueAt,
    attachments: data.attachments ?? [],
    projectId,
    createdBy: user.userId,
  });

  const populated = await task.populate([
    { path: "assignees", select: "name email" },
    { path: "createdBy", select: "name email" },
  ]);

  await emitToProject(projectId, EVENTS.TASK_CREATED, populated.toObject());

  return apiSuccess(populated, 201);
});
