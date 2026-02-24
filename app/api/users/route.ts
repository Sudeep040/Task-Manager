import { NextRequest } from "next/server";
import User from "@/lib/db/models/User";
import Project from "@/lib/db/models/Project";
import { apiSuccess, getAuthUser, withAuth } from "@/lib/api-helpers";

export const GET = withAuth(async (req: NextRequest) => {
  getAuthUser(req); // ensure authenticated

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const excludeProjectId = searchParams.get("projectId");

  let excludeIds: string[] = [];
  if (excludeProjectId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = await Project.findById(excludeProjectId).select("members").lean() as any;
    if (project && Array.isArray(project.members)) {
      excludeIds = project.members.map((m: { toString(): string }) => m.toString());
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
});
