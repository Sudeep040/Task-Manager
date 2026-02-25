import { signToken, verifyToken, extractBearerToken, JwtPayload } from "@/lib/auth/jwt";
import jwt from "jsonwebtoken";

const VALID_PAYLOAD: JwtPayload = { userId: "user-123", email: "alice@example.com" };

// ─── signToken ────────────────────────────────────────────────────────────────

describe("signToken", () => {
  it("returns a non-empty JWT string", () => {
    const token = signToken(VALID_PAYLOAD);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("produces a token with three dot-separated parts (header.payload.signature)", () => {
    const token = signToken(VALID_PAYLOAD);
    expect(token.split(".")).toHaveLength(3);
  });

  it("embeds userId and email in the payload", () => {
    const token = signToken(VALID_PAYLOAD);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded.userId).toBe(VALID_PAYLOAD.userId);
    expect(decoded.email).toBe(VALID_PAYLOAD.email);
  });

  it("throws when JWT_SECRET is not set", () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => signToken(VALID_PAYLOAD)).toThrow("JWT_SECRET");
    process.env.JWT_SECRET = original;
  });

  it("respects the JWT_EXPIRES_IN env variable", () => {
    process.env.JWT_EXPIRES_IN = "1h";
    const token = signToken(VALID_PAYLOAD);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    const exp = decoded.exp as number;
    const iat = decoded.iat as number;
    // 1 hour = 3600 seconds
    expect(exp - iat).toBe(3600);
    process.env.JWT_EXPIRES_IN = "7d"; // restore
  });
});

// ─── verifyToken ──────────────────────────────────────────────────────────────

describe("verifyToken", () => {
  it("returns the original payload for a valid token", () => {
    const token = signToken(VALID_PAYLOAD);
    const result = verifyToken(token);
    expect(result.userId).toBe(VALID_PAYLOAD.userId);
    expect(result.email).toBe(VALID_PAYLOAD.email);
  });

  it("throws for a tampered token", () => {
    const token = signToken(VALID_PAYLOAD);
    const [header, , sig] = token.split(".");
    // corrupt the payload segment
    const corruptedPayload = Buffer.from(JSON.stringify({ userId: "evil", email: "x" })).toString("base64url");
    const tampered = `${header}.${corruptedPayload}.${sig}`;
    expect(() => verifyToken(tampered)).toThrow();
  });

  it("throws for a token signed with a different secret", () => {
    const foreignToken = jwt.sign(VALID_PAYLOAD, "different-secret", { expiresIn: "7d" });
    expect(() => verifyToken(foreignToken)).toThrow();
  });

  it("throws for an expired token", () => {
    // sign with -1s TTL so it's already expired
    const expiredToken = jwt.sign(VALID_PAYLOAD, process.env.JWT_SECRET!, { expiresIn: -1 });
    expect(() => verifyToken(expiredToken)).toThrow();
  });

  it("throws for a completely invalid string", () => {
    expect(() => verifyToken("not.a.token")).toThrow();
  });

  it("throws when JWT_SECRET is missing at verify time", () => {
    const token = signToken(VALID_PAYLOAD);
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => verifyToken(token)).toThrow("JWT_SECRET");
    process.env.JWT_SECRET = original;
  });
});

// ─── extractBearerToken ───────────────────────────────────────────────────────

describe("extractBearerToken", () => {
  it("returns the token when the header is a valid Bearer token", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("returns null for a null header", () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it("returns null when the header does not start with 'Bearer '", () => {
    expect(extractBearerToken("Token abc123")).toBeNull();
    expect(extractBearerToken("bearer abc123")).toBeNull(); // case-sensitive
    expect(extractBearerToken("abc123")).toBeNull();
  });

  it("returns an empty string when 'Bearer ' is present with no token after it", () => {
    expect(extractBearerToken("Bearer ")).toBe("");
  });

  it("preserves the full token including dots (JWT format)", () => {
    const fakeJwt = "header.payload.signature";
    expect(extractBearerToken(`Bearer ${fakeJwt}`)).toBe(fakeJwt);
  });
});
