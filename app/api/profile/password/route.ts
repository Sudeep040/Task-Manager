import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import User from "@/lib/db/models/User";
import { changePasswordSchema } from "@/lib/validation/profile.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth } from "@/lib/api-helpers";

export const PATCH = withAuth(async (req: NextRequest) => {
  const auth = getAuthUser(req);
  const body = await req.json();
  const { currentPassword, newPassword } = changePasswordSchema.parse(body);

  const user = await User.findById(auth.userId);
  if (!user) throw new ApiError(404, "User not found", "NOT_FOUND");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new ApiError(401, "Current password is incorrect", "INVALID_PASSWORD");

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  return apiSuccess({ message: "Password updated successfully" });
});
