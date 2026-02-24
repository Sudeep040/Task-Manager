import { NextRequest } from "next/server";
import Project from "@/lib/db/models/Project";
// Ensure User model is registered so populate('owner'|'members') works
import "@/lib/db/models/User";
import { createProjectSchema } from "@/lib/validation/task.schema";
import { apiSuccess, getAuthUser, withAuth } from "@/lib/api-helpers";

export const GET = withAuth(async (req: NextRequest) => {
  const user = getAuthUser(req);

  const projects = await Project.find({
    $or: [{ owner: user.userId }, { members: user.userId }],
  })
    .populate("owner", "name email")
    .populate("members", "name email")
    .sort({ updatedAt: -1 })
    .lean();

  return apiSuccess(projects);
});

export const POST = withAuth(async (req: NextRequest) => {
  const user = getAuthUser(req);
  const body = await req.json();
  const { name, description } = createProjectSchema.parse(body);

  const project = await Project.create({
    name,
    description,
    owner: user.userId,
    members: [user.userId],
  });

  // populate both owner and members so client receives full member objects (not just IDs)
  const populated = await project.populate([
    { path: "owner", select: "name email" },
    { path: "members", select: "name email" },
  ]);

  return apiSuccess(populated, 201);
});
