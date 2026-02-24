import { NextRequest } from "next/server";
import User from "@/lib/db/models/User";
import { updateProfileSchema } from "@/lib/validation/profile.schema";
import { apiSuccess, getAuthUser, withAuth } from "@/lib/api-helpers";

export const GET = withAuth(async (req: NextRequest) => {
  const auth = getAuthUser(req);
  const user = await User.findById(auth.userId).select("-passwordHash").lean();
  if (!user) throw new Error("User not found");
  return apiSuccess(user);
});

export const PATCH = withAuth(async (req: NextRequest) => {
  const auth = getAuthUser(req);
  const body = await req.json();
  const updates = updateProfileSchema.parse(body);

  const user = await User.findByIdAndUpdate(
    auth.userId,
    { $set: updates },
    { new: true, runValidators: true }
  ).select("-passwordHash");

  if (!user) throw new Error("User not found");
  return apiSuccess(user);
});
