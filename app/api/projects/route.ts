import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connect";
import Project from "@/lib/db/models/Project";
// Ensure User model is registered so populate('owner'|'members') works
import "@/lib/db/models/User";
import { createProjectSchema } from "@/lib/validation/task.schema";
import { apiSuccess, apiError, getAuthUser } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const user = getAuthUser(req);

    const projects = await Project.find({
      $or: [{ owner: user.userId }, { members: user.userId }],
    })
      .populate("owner", "name email")
      .populate("members", "name email")
      .sort({ updatedAt: -1 })
      .lean();

    return apiSuccess(projects);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    const body = await req.json();
    const { name, description } = createProjectSchema.parse(body);

    const project = await Project.create({
      name,
      description,
      owner: user.userId,
      members: [user.userId],
    });

    const populated = await project.populate("owner", "name email");

    return apiSuccess(populated, 201);
  } catch (error) {
    return apiError(error);
  }
}
