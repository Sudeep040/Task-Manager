import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connect";
import Project from "@/lib/db/models/Project";
import { updateProjectSchema } from "@/lib/validation/task.schema";
import { apiSuccess, apiError, getAuthUser, ApiError } from "@/lib/api-helpers";

interface Params {
  params: Promise<{ projectId: string }>;
}

async function getProjectOrThrow(projectId: string, userId: string) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new ApiError(400, "Invalid project ID", "INVALID_ID");
  }
  const project = await Project.findById(projectId)
    .populate("owner", "name email")
    .populate("members", "name email");
  if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");

  const isMember =
    project.owner._id.toString() === userId ||
    project.members.some((m) => m._id.toString() === userId);
  if (!isMember) throw new ApiError(403, "Access denied", "FORBIDDEN");

  return project;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    const { projectId } = await params;
    const project = await getProjectOrThrow(projectId, user.userId);
    return apiSuccess(project);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    const { projectId } = await params;
    const project = await getProjectOrThrow(projectId, user.userId);

    if (project.owner._id.toString() !== user.userId) {
      throw new ApiError(403, "Only the project owner can update it", "FORBIDDEN");
    }

    const body = await req.json();
    const updates = updateProjectSchema.parse(body);
    Object.assign(project, updates);
    await project.save();

    return apiSuccess(project);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    const { projectId } = await params;
    const project = await getProjectOrThrow(projectId, user.userId);

    if (project.owner._id.toString() !== user.userId) {
      throw new ApiError(403, "Only the project owner can delete it", "FORBIDDEN");
    }

    await project.deleteOne();
    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
