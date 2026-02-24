import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Task from "@/lib/db/models/Task";
import Comment from "@/lib/db/models/Comment";
import Project from "@/lib/db/models/Project";
import { searchQuerySchema } from "@/lib/validation/search.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth } from "@/lib/api-helpers";

export const GET = withAuth(async (req: NextRequest) => {
  const user = getAuthUser(req);

  const { searchParams } = new URL(req.url);
  const { q, projectId, limit } = searchQuerySchema.parse({
    q: searchParams.get("q") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
    limit: searchParams.get("limit") ?? 20,
  });

  const accessibleProjects = await Project.find({
    $or: [{ owner: user.userId }, { members: user.userId }],
  }).select("_id");
  const accessibleIds = accessibleProjects.map((p) => p._id.toString());

  if (projectId) {
    if (!mongoose.isValidObjectId(projectId)) {
      throw new ApiError(400, "Invalid project ID", "INVALID_ID");
    }
    if (!accessibleIds.includes(projectId)) {
      throw new ApiError(403, "Access denied", "FORBIDDEN");
    }
  }

  const projectFilter = projectId
    ? [new mongoose.Types.ObjectId(projectId)]
    : accessibleProjects.map((p) => p._id);

  const taskResults = await Task.find({
    $text: { $search: q },
    projectId: { $in: projectFilter },
  })
    .select({ score: { $meta: "textScore" }, title: 1, description: 1, status: 1, projectId: 1, assignees: 1 })
    .sort({ score: { $meta: "textScore" } })
    .limit(limit)
    .populate("assignees", "name email")
    .lean();

  const commentResults = await Comment.find({
    $text: { $search: q },
    taskId: {
      $in: await Task.find({ projectId: { $in: projectFilter } }).distinct("_id"),
    },
  })
    .select({ score: { $meta: "textScore" }, body: 1, taskId: 1, authorId: 1, createdAt: 1 })
    .sort({ score: { $meta: "textScore" } })
    .limit(limit)
    .populate("authorId", "name email")
    .lean();

  return apiSuccess({
    tasks: taskResults.map((t) => ({ ...t, type: "task" })),
    comments: commentResults.map((c) => ({ ...c, type: "comment" })),
    query: q,
  });
});
