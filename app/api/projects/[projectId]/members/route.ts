import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connect";
import Project from "@/lib/db/models/Project";
import User from "@/lib/db/models/User";
import { memberSchema } from "@/lib/validation/member.schema";
import { apiSuccess, apiError, getAuthUser, ApiError } from "@/lib/api-helpers";

interface Params {
  params: Promise<{ projectId: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await connectDB();
    const authUser = getAuthUser(req);
    const { projectId } = await params;

    if (!mongoose.isValidObjectId(projectId)) {
      throw new ApiError(400, "Invalid project ID", "INVALID_ID");
    }

    const project = await Project.findById(projectId);
    if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");
    if (project.owner.toString() !== authUser.userId) {
      throw new ApiError(403, "Only the owner can add members", "FORBIDDEN");
    }

    const body = await req.json();
    const { email } = memberSchema.parse(body);

    const newMember = await User.findOne({ email });
    if (!newMember) throw new ApiError(404, "User with that email not found", "USER_NOT_FOUND");

    const alreadyMember = project.members.some((m) => m.toString() === newMember._id.toString());
    if (alreadyMember) throw new ApiError(409, "User is already a member", "ALREADY_MEMBER");

    project.members.push(newMember._id);
    await project.save();

    const populated = await project.populate("members", "name email");
    return apiSuccess(populated);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await connectDB();
    const authUser = getAuthUser(req);
    const { projectId } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!mongoose.isValidObjectId(projectId) || !userId || !mongoose.isValidObjectId(userId)) {
      throw new ApiError(400, "Invalid IDs", "INVALID_ID");
    }

    const project = await Project.findById(projectId);
    if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");
    if (project.owner.toString() !== authUser.userId) {
      throw new ApiError(403, "Only the owner can remove members", "FORBIDDEN");
    }
    if (project.owner.toString() === userId) {
      throw new ApiError(400, "Cannot remove project owner", "CANNOT_REMOVE_OWNER");
    }

    project.members = project.members.filter((m) => m.toString() !== userId);
    await project.save();

    return apiSuccess({ removed: true });
  } catch (error) {
    return apiError(error);
  }
}
