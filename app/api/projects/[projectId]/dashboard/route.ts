import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Project from "@/lib/db/models/Project";
import Task from "@/lib/db/models/Task";
import { dashboardQuerySchema } from "@/lib/validation/task.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth, encodeCursor, decodeCursor } from "@/lib/api-helpers";

interface Params {
  params: Promise<{ projectId: string }>;
}

export const GET = withAuth(async (req: NextRequest, { params }: Params) => {
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

  const { searchParams } = new URL(req.url);
  const query = dashboardQuerySchema.parse({
    status: searchParams.get("status") ?? undefined,
    assignee: searchParams.get("assignee") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? 20,
  });

  type TaskFilter = {
    projectId: string;
    status?: string;
    assignees?: string;
    $or?: Array<
      | { updatedAt: { $lt: Date } }
      | { updatedAt: Date; _id: { $lt: mongoose.Types.ObjectId } }
    >;
  };

  const filter: TaskFilter = { projectId };
  if (query.status) filter.status = query.status;
  if (query.assignee) filter.assignees = query.assignee;

  if (query.cursor) {
    const { updatedAt, _id } = decodeCursor(query.cursor);
    filter.$or = [
      { updatedAt: { $lt: new Date(updatedAt) } },
      {
        updatedAt: new Date(updatedAt),
        _id: { $lt: new mongoose.Types.ObjectId(_id) },
      },
    ];
  }

  const limit = query.limit;
  const tasks = await Task.find(filter)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate("assignees", "name email")
    .populate("createdBy", "name email")
    .lean();

  let nextCursor: string | null = null;
  if (tasks.length > limit) {
    tasks.pop();
    const last = tasks[tasks.length - 1];
    nextCursor = encodeCursor({
      updatedAt: last.updatedAt.toISOString(),
      _id: last._id.toString(),
    });
  }

  return apiSuccess({ tasks, nextCursor, count: tasks.length });
});
