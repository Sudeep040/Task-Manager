import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connect";
import User from "@/lib/db/models/User";
import { updateProfileSchema } from "@/lib/validation/profile.schema";
import { apiSuccess, apiError, getAuthUser } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const auth = getAuthUser(req);
    const user = await User.findById(auth.userId).select("-passwordHash").lean();
    if (!user) throw new Error("User not found");
    return apiSuccess(user);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
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
  } catch (error) {
    return apiError(error);
  }
}
