import { OAuth2Client } from "google-auth-library";
import { withHandler, apiSuccess, ApiError } from "@/lib/api-helpers";
import { signToken } from "@/lib/auth/jwt";
import User from "@/lib/db/models/User";
import { NextRequest } from "next/server";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const POST = withHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { credential } = body as { credential?: string };

  if (!credential) {
    throw new ApiError(400, "Missing Google credential token", "MISSING_CREDENTIAL");
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new ApiError(500, "Google OAuth is not configured", "GOOGLE_NOT_CONFIGURED");
  }

  // Verify the Google ID token
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw new ApiError(401, "Invalid Google token", "INVALID_GOOGLE_TOKEN");
  }

  if (!payload?.email || !payload.sub) {
    throw new ApiError(401, "Google token missing required fields", "INVALID_GOOGLE_TOKEN");
  }

  const { sub: googleId, email, name, picture } = payload;
  const normalizedEmail = email.toLowerCase();

  // Find existing user by googleId or email, or create a new one
  let user = await User.findOne({ $or: [{ googleId }, { email: normalizedEmail }] });

  if (user) {
    // Link googleId if the user signed up with email/password before
    if (!user.googleId) {
      user.googleId = googleId;
    }
    if (picture && !user.avatarUrl) {
      user.avatarUrl = picture;
    }
    user.lastActiveAt = new Date();
    await user.save();
  } else {
    user = await User.create({
      email: normalizedEmail,
      googleId,
      name: name ?? normalizedEmail.split("@")[0],
      avatarUrl: picture,
      lastActiveAt: new Date(),
    });
  }

  const token = signToken({ userId: user._id.toString(), email: user.email });

  return apiSuccess(
    { token, user: { id: user._id.toString(), email: user.email, name: user.name } },
    200
  );
});
