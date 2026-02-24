import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import User from "@/lib/db/models/User";
import { signToken } from "@/lib/auth/jwt";
import { registerSchema } from "@/lib/validation/auth.schema";
import { apiSuccess, ApiError, withHandler } from "@/lib/api-helpers";

export const POST = withHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { email, password, name } = registerSchema.parse(body);

  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(409, "Email already registered", "EMAIL_EXISTS");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ email, passwordHash, name });

  const token = signToken({ userId: user._id.toString(), email: user.email });

  return apiSuccess(
    {
      token,
      user: { id: user._id, email: user.email, name: user.name },
    },
    201
  );
});
