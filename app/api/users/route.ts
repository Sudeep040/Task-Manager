import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connect";
import User from "@/lib/db/models/User";
import Project from "@/lib/db/models/Project";
import { apiSuccess, apiError, getAuthUser } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    getAuthUser(req); // ensure authenticated

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const excludeProjectId = searchParams.get("projectId");

    let excludeIds: string[] = [];
    if (excludeProjectId) {
      const project = await Project.findById(excludeProjectId).select("members").lean();
      if (project && Array.isArray(project.members)) {
        excludeIds = project.members.map((m: any) => m.toString());
      }
    }

    const filter: any = {};
    if (q.trim()) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      filter.$or = [{ name: regex }, { email: regex }];
    }
    if (excludeIds.length) {
      filter._id = { $nin: excludeIds };
    }

    const users = await User.find(filter).select("name email").limit(50).lean();
    return apiSuccess(users);
  } catch (error) {
    return apiError(error);
  }
}

