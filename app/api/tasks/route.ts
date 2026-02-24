import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Task from "@/lib/db/models/Task";
import Project from "@/lib/db/models/Project";
import { apiSuccess, getAuthUser, withAuth } from "@/lib/api-helpers";

export const GET = withAuth(async (req: NextRequest) => {
  const user = getAuthUser(req);
  const userId = new mongoose.Types.ObjectId(user.userId);

  const projects = await Project.find({
    $or: [{ owner: userId }, { members: userId }],
  }).select("_id name");

  if (projects.length === 0) {
    return apiSuccess({ tasks: [] });
  }

  const projectIds = projects.map((p) => p._id);
  const projectMap = Object.fromEntries(
    projects.map((p) => [p._id.toString(), p.name])
  );

  const tasks = await Task.find({ projectId: { $in: projectIds } })
    .populate("assignees", "name email")
    .populate("createdBy", "name email")
    .sort({ updatedAt: -1 })
    .limit(200);

  const result = tasks.map((t) => ({
    ...t.toObject(),
    projectName: projectMap[t.projectId.toString()] ?? "Unknown",
  }));

  return apiSuccess({ tasks: result });
});
