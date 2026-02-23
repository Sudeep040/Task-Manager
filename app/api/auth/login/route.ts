import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db/connect";
import User from "@/lib/db/models/User";
import { signToken } from "@/lib/auth/jwt";
import { loginSchema } from "@/lib/validation/auth.schema";
import { apiSuccess, apiError, ApiError } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const user = await User.findOne({ email });
    if (!user) throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");

    await User.findByIdAndUpdate(user._id, { lastActiveAt: new Date() });

    const token = signToken({ userId: user._id.toString(), email: user.email });

    return apiSuccess({
      token,
      user: { id: user._id, email: user.email, name: user.name },
    });
  } catch (error) {
    return apiError(error);
  }
}
