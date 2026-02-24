# Task Manager — Step-by-Step Build Guide

This guide walks you through rebuilding this project from scratch, one commit at a time.
Every step is a working, committable checkpoint. Follow the order exactly — each step
builds on the previous one.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15+ (App Router, TypeScript) |
| Database | MongoDB via Mongoose |
| Auth | JWT (jsonwebtoken + jose for Edge) |
| Real-time | Socket.io + optional Redis adapter |
| Styling | Tailwind CSS v4 |
| Validation | Zod |
| Runtime | Node.js (custom HTTP server via `tsx`) |

---

## Commit Roadmap

| # | Commit | What you build |
|---|---|---|
| 1 | `init: scaffold Next.js project` | Bare Next.js + TypeScript + Tailwind |
| 2 | `feat: install and configure dependencies` | All npm packages + env file |
| 3 | `feat: MongoDB connection and data models` | `connectDB` + 4 Mongoose models |
| 4 | `feat: JWT auth utilities and API helpers` | JWT helpers, `withAuth`, `ApiError` |
| 5 | `feat: auth middleware` | Edge middleware protecting all `/api` routes |
| 6 | `feat: auth API — register and login` | `/api/auth/register`, `/api/auth/login` |
| 7 | `feat: projects API` | Full CRUD for projects + member management |
| 8 | `feat: tasks API` | Create, read, update, delete tasks |
| 9 | `feat: comments API with cursor pagination` | Comments + paginated fetch |
| 10 | `feat: dashboard and search APIs` | Filtered task listing + full-text search |
| 11 | `feat: profile API` | Get/update profile + change password |
| 12 | `feat: custom Node server with Socket.io` | `server.ts`, socket auth, presence map |
| 13 | `feat: Socket.io events and client hook` | `EVENTS` constants, `useSocket` hook |
| 14 | `feat: login and register pages` | Auth UI with JWT token storage |
| 15 | `feat: projects listing page` | Projects list, create project modal |
| 16 | `feat: project dashboard page` | Kanban board, task cards, real-time updates |
| 17 | `feat: task modal with comments` | Task detail view + comment thread |
| 18 | `feat: profile page` | Edit name, avatar, change password |

---

## Step 1 — Scaffold the Next.js Project

```bash
npx create-next-app@latest task-manager \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*"

cd task-manager
```

Verify the default dev server works:

```bash
npm run dev
```

**Commit:**
```bash
git add .
git commit -m "init: scaffold Next.js project with TypeScript and Tailwind"
```

---

## Step 2 — Install Dependencies and Configure Environment

### Install runtime dependencies

```bash
npm install mongoose bcryptjs jsonwebtoken jose socket.io socket.io-client @socket.io/redis-adapter redis zod
```

### Install dev dependencies

```bash
npm install -D tsx dotenv @types/bcryptjs @types/jsonwebtoken @types/node
```

### Update `package.json` scripts

Replace the `scripts` block:

```json
"scripts": {
  "dev": "tsx server.ts",
  "dev:next": "next dev",
  "build": "next build",
  "start": "tsx server.ts",
  "lint": "eslint"
}
```

### Create `.env.local`

```env
MONGO_URI=mongodb://localhost:27017/task-manager
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=7d
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000

# Optional — only needed for multi-server horizontal scaling
# REDIS_URL=redis://localhost:6379
```

Add `.env.local` to `.gitignore` (it should already be there from create-next-app).

**Commit:**
```bash
git add .
git commit -m "feat: install dependencies and configure environment variables"
```

---

## Step 3 — MongoDB Connection and Data Models

### `lib/db/connect.ts`

This module returns a cached Mongoose connection so Next.js hot reloads and
serverless invocations don't open a new connection on every request.

```typescript
import mongoose from "mongoose";

function getMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Please define MONGO_URI in .env.local");
  return uri;
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache;
}

const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(getMongoUri(), { bufferCommands: false });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
```

### `lib/db/models/User.ts`

```typescript
import mongoose, { Document, Model, Schema } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  avatarUrl?: string;
  lastActiveAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String },
    lastActiveAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 });

const User: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>("User", UserSchema);

export default User;
```

### `lib/db/models/Project.ts`

```typescript
import mongoose, { Document, Model, Schema } from "mongoose";

export interface IProject extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  owner: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

ProjectSchema.index({ owner: 1, updatedAt: -1 });
ProjectSchema.index({ members: 1, updatedAt: -1 });
ProjectSchema.index({ updatedAt: -1 });

const Project: Model<IProject> =
  mongoose.models.Project ?? mongoose.model<IProject>("Project", ProjectSchema);

export default Project;
```

### `lib/db/models/Task.ts`

```typescript
import mongoose, { Document, Model, Schema } from "mongoose";

export type TaskStatus = "todo" | "in_progress" | "done" | "archived";

export interface ITask extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  status: TaskStatus;
  assignees: mongoose.Types.ObjectId[];
  priority: number;
  commentCount: number;
  lastCommentAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: ["todo", "in_progress", "done", "archived"],
      default: "todo",
    },
    assignees: [{ type: Schema.Types.ObjectId, ref: "User" }],
    priority: { type: Number, default: 3, min: 1, max: 5 },
    commentCount: { type: Number, default: 0 },
    lastCommentAt: { type: Date },
    dueAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Compound indexes for dashboard queries — include _id as cursor tiebreaker
TaskSchema.index({ projectId: 1, status: 1, updatedAt: -1, _id: -1 });
TaskSchema.index({ projectId: 1, assignees: 1, updatedAt: -1, _id: -1 });
TaskSchema.index({ projectId: 1, updatedAt: -1, _id: -1 });
// Text index for search, scoped to projectId
TaskSchema.index({ projectId: 1, title: "text", description: "text" });

const Task: Model<ITask> =
  mongoose.models.Task ?? mongoose.model<ITask>("Task", TaskSchema);

export default Task;
```

### `lib/db/models/Comment.ts`

```typescript
import mongoose, { Document, Model, Schema } from "mongoose";

export interface IComment extends Document {
  _id: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

CommentSchema.index({ taskId: 1, createdAt: -1, _id: -1 });
CommentSchema.index({ authorId: 1 });
CommentSchema.index({ taskId: 1, body: "text" });

const Comment: Model<IComment> =
  mongoose.models.Comment ?? mongoose.model<IComment>("Comment", CommentSchema);

export default Comment;
```

**Commit:**
```bash
git add .
git commit -m "feat: add MongoDB connection helper and Mongoose models (User, Project, Task, Comment)"
```

---

## Step 4 — JWT Auth Utilities and API Helpers

### `lib/auth/jwt.ts`

```typescript
import jwt from "jsonwebtoken";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not defined");
  return secret;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getJwtSecret());
  if (typeof decoded === "string") throw new Error("Invalid token");
  return decoded as JwtPayload;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}
```

### `lib/api-helpers.ts`

This is the backbone used by every route handler:

- `ApiError` — structured error with HTTP status + code
- `apiSuccess` / `apiError` — consistent JSON shape `{ success, data | error }`
- `withHandler` — wraps public routes (DB connect + error catch)
- `withAuth` — wraps protected routes (DB connect + JWT verify + error catch)
- `getAuthUser` — extracts JWT payload from the request
- `encodeCursor` / `decodeCursor` — base64url cursor-based pagination

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { verifyToken, extractBearerToken, JwtPayload } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/db/connect";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { success: false, error: { message: error.message, code: error.code ?? "ERROR" } },
      { status: error.statusCode }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { success: false, error: { message: "Validation failed", code: "VALIDATION_ERROR", details: error.issues } },
      { status: 400 }
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { success: false, error: { message: "Invalid JSON in request body", code: "INVALID_JSON" } },
      { status: 400 }
    );
  }
  console.error("[API Error]", error);
  return NextResponse.json(
    { success: false, error: { message: "Internal server error", code: "INTERNAL_ERROR" } },
    { status: 500 }
  );
}

export function getAuthUser(req: NextRequest): JwtPayload {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
  try {
    return verifyToken(token);
  } catch {
    throw new ApiError(401, "Invalid or expired token", "INVALID_TOKEN");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteContext = { params: Promise<any> };
type RouteHandler = (req: NextRequest, context: RouteContext) => Promise<NextResponse>;

export function withHandler(handler: RouteHandler): RouteHandler {
  return async (req, context) => {
    try {
      await connectDB();
      return await handler(req, context);
    } catch (error) {
      return apiError(error);
    }
  };
}

export function withAuth(handler: RouteHandler): RouteHandler {
  return async (req, context) => {
    try {
      await connectDB();
      getAuthUser(req);
      return await handler(req, context);
    } catch (error) {
      return apiError(error);
    }
  };
}

// --- Cursor-based pagination ---
export interface Cursor {
  updatedAt: string;
  _id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(encoded: string): Cursor {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Cursor;
  } catch {
    throw new ApiError(400, "Invalid pagination cursor", "INVALID_CURSOR");
  }
}
```

**Commit:**
```bash
git add .
git commit -m "feat: add JWT helpers and API handler utilities (withAuth, ApiError, cursor pagination)"
```

---

## Step 5 — Auth Middleware

Create `middleware.ts` at the project root. This runs on Next.js Edge Runtime and
protects every route under `/api/` except the two public auth endpoints.

```typescript
// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken } from "@/lib/auth/jwt";
import { jwtVerify } from "jose";

const PUBLIC_API_ROUTES = ["/api/auth/register", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (PUBLIC_API_ROUTES.includes(pathname)) return NextResponse.next();

  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return NextResponse.json(
      { success: false, error: { message: "Authentication required", code: "UNAUTHORIZED" } },
      { status: 401 }
    );
  }

  try {
    // jose is Web Crypto-compatible — required for Next.js Edge runtime
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "");
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Invalid or expired token", code: "INVALID_TOKEN" } },
      { status: 401 }
    );
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
```

> **Why both `jsonwebtoken` and `jose`?**
> `jsonwebtoken` uses Node.js crypto and runs only in the Node runtime (API routes).
> `jose` uses the Web Crypto API and runs in the Edge runtime (middleware).
> Middleware must use `jose`; route handlers can use either.

**Commit:**
```bash
git add .
git commit -m "feat: add Edge middleware for JWT authentication on all /api routes"
```

---

## Step 6 — Auth API (Register + Login)

### Validation schemas — `lib/validation/auth.schema.ts`

```typescript
import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
```

### `app/api/auth/register/route.ts`

```typescript
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
    { token, user: { id: user._id, email: user.email, name: user.name } },
    201
  );
});
```

### `app/api/auth/login/route.ts`

```typescript
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import User from "@/lib/db/models/User";
import { signToken } from "@/lib/auth/jwt";
import { loginSchema } from "@/lib/validation/auth.schema";
import { apiSuccess, ApiError, withHandler } from "@/lib/api-helpers";

export const POST = withHandler(async (req: NextRequest) => {
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
});
```

**Test with curl:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
```

**Commit:**
```bash
git add .
git commit -m "feat: add register and login API endpoints with bcrypt and JWT"
```

---

## Step 7 — Projects API

### Validation — add to `lib/validation/task.schema.ts`

```typescript
import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});

export const updateProjectSchema = createProjectSchema.partial();
```

### `app/api/projects/route.ts` — list all + create

```typescript
import { NextRequest } from "next/server";
import Project from "@/lib/db/models/Project";
import "@/lib/db/models/User"; // register User model for populate()
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
  const { name, description } = createProjectSchema.parse(await req.json());

  const project = await Project.create({
    name,
    description,
    owner: user.userId,
    members: [user.userId], // creator is automatically a member
  });

  const populated = await project.populate([
    { path: "owner", select: "name email" },
    { path: "members", select: "name email" },
  ]);

  return apiSuccess(populated, 201);
});
```

### `app/api/projects/[projectId]/route.ts` — get, update, delete

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Project from "@/lib/db/models/Project";
import { updateProjectSchema } from "@/lib/validation/task.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth } from "@/lib/api-helpers";

interface Params { params: Promise<{ projectId: string }> }

async function getProjectOrThrow(projectId: string, userId: string) {
  if (!mongoose.isValidObjectId(projectId))
    throw new ApiError(400, "Invalid project ID", "INVALID_ID");

  const project = await Project.findById(projectId)
    .populate("owner", "name email")
    .populate("members", "name email");
  if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");

  const isMember =
    project.owner._id.toString() === userId ||
    project.members.some((m) => m._id.toString() === userId);
  if (!isMember) throw new ApiError(403, "Access denied", "FORBIDDEN");

  return project;
}

export const GET = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { projectId } = await params;
  return apiSuccess(await getProjectOrThrow(projectId, user.userId));
});

export const PATCH = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { projectId } = await params;
  const project = await getProjectOrThrow(projectId, user.userId);
  if (project.owner._id.toString() !== user.userId)
    throw new ApiError(403, "Only the project owner can update it", "FORBIDDEN");
  Object.assign(project, updateProjectSchema.parse(await req.json()));
  await project.save();
  return apiSuccess(project);
});

export const DELETE = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { projectId } = await params;
  const project = await getProjectOrThrow(projectId, user.userId);
  if (project.owner._id.toString() !== user.userId)
    throw new ApiError(403, "Only the project owner can delete it", "FORBIDDEN");
  await project.deleteOne();
  return apiSuccess({ deleted: true });
});
```

### `app/api/projects/[projectId]/members/route.ts` — add/remove members

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Project from "@/lib/db/models/Project";
import User from "@/lib/db/models/User";
import { z } from "zod";
import { apiSuccess, getAuthUser, ApiError, withAuth } from "@/lib/api-helpers";

interface Params { params: Promise<{ projectId: string }> }

const memberSchema = z.object({ email: z.string().email() });

export const POST = withAuth(async (req: NextRequest, { params }: Params) => {
  const auth = getAuthUser(req);
  const { projectId } = await params;

  if (!mongoose.isValidObjectId(projectId))
    throw new ApiError(400, "Invalid project ID", "INVALID_ID");

  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");
  if (project.owner.toString() !== auth.userId)
    throw new ApiError(403, "Only the owner can add members", "FORBIDDEN");

  const { email } = memberSchema.parse(await req.json());
  const newMember = await User.findOne({ email });
  if (!newMember) throw new ApiError(404, "User with that email not found", "USER_NOT_FOUND");

  if (project.members.some((m) => m.toString() === newMember._id.toString()))
    throw new ApiError(409, "User is already a member", "ALREADY_MEMBER");

  project.members.push(newMember._id);
  await project.save();

  return apiSuccess(await project.populate("members", "name email"));
});

export const DELETE = withAuth(async (req: NextRequest, { params }: Params) => {
  const auth = getAuthUser(req);
  const { projectId } = await params;
  const userId = new URL(req.url).searchParams.get("userId");

  if (!mongoose.isValidObjectId(projectId) || !userId || !mongoose.isValidObjectId(userId))
    throw new ApiError(400, "Invalid IDs", "INVALID_ID");

  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");
  if (project.owner.toString() !== auth.userId)
    throw new ApiError(403, "Only the owner can remove members", "FORBIDDEN");
  if (project.owner.toString() === userId)
    throw new ApiError(400, "Cannot remove project owner", "CANNOT_REMOVE_OWNER");

  project.members = project.members.filter((m) => m.toString() !== userId);
  await project.save();
  return apiSuccess({ removed: true });
});
```

**Commit:**
```bash
git add .
git commit -m "feat: add projects CRUD API and member management endpoints"
```

---

## Step 8 — Tasks API

### Add task schemas to `lib/validation/task.schema.ts`

```typescript
export const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  status: z.enum(["todo", "in_progress", "done", "archived"]).default("todo"),
  assignees: z.array(z.string()).optional(),
  priority: z.number().int().min(1).max(5).default(3),
  dueAt: z.string().datetime().optional(),
});

export const updateTaskSchema = createTaskSchema.partial();
```

### `app/api/projects/[projectId]/tasks/route.ts` — create task

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Project from "@/lib/db/models/Project";
import Task from "@/lib/db/models/Task";
import { createTaskSchema } from "@/lib/validation/task.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth } from "@/lib/api-helpers";
import { emitToProject } from "@/lib/socket/emitter";
import { EVENTS } from "@/lib/socket/events";

interface Params { params: Promise<{ projectId: string }> }

export const POST = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { projectId } = await params;

  if (!mongoose.isValidObjectId(projectId))
    throw new ApiError(400, "Invalid project ID", "INVALID_ID");

  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");

  const isMember =
    project.owner.toString() === user.userId ||
    project.members.some((m) => m.toString() === user.userId);
  if (!isMember) throw new ApiError(403, "Access denied", "FORBIDDEN");

  const data = createTaskSchema.parse(await req.json());

  const task = await Task.create({
    ...data,
    assignees: (data.assignees ?? []).map((id) => new mongoose.Types.ObjectId(id)),
    dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
    projectId,
    createdBy: user.userId,
  });

  const populated = await task.populate([
    { path: "assignees", select: "name email" },
    { path: "createdBy", select: "name email" },
  ]);

  // Emit real-time event to all project members (Step 12 wires this up)
  await emitToProject(projectId, EVENTS.TASK_CREATED, populated.toObject());

  return apiSuccess(populated, 201);
});
```

### `app/api/tasks/[taskId]/route.ts` — get, update, delete

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Task from "@/lib/db/models/Task";
import Project from "@/lib/db/models/Project";
import { updateTaskSchema } from "@/lib/validation/task.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth } from "@/lib/api-helpers";
import { emitToProject } from "@/lib/socket/emitter";
import { EVENTS } from "@/lib/socket/events";

interface Params { params: Promise<{ taskId: string }> }

async function getTaskAndVerifyAccess(taskId: string, userId: string) {
  if (!mongoose.isValidObjectId(taskId))
    throw new ApiError(400, "Invalid task ID", "INVALID_ID");
  const task = await Task.findById(taskId);
  if (!task) throw new ApiError(404, "Task not found", "NOT_FOUND");

  const project = await Project.findById(task.projectId);
  if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");

  const isMember =
    project.owner.toString() === userId ||
    project.members.some((m) => m.toString() === userId);
  if (!isMember) throw new ApiError(403, "Access denied", "FORBIDDEN");

  return { task, project };
}

export const GET = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { taskId } = await params;
  const { task } = await getTaskAndVerifyAccess(taskId, user.userId);
  const populated = await task.populate([
    { path: "assignees", select: "name email" },
    { path: "createdBy", select: "name email" },
  ]);
  return apiSuccess(populated);
});

export const PATCH = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { taskId } = await params;
  const { task } = await getTaskAndVerifyAccess(taskId, user.userId);
  const updates = updateTaskSchema.parse(await req.json());

  const isCreator = task.createdBy?.toString() === user.userId;
  const isAssignee = task.assignees.some((a) => a.toString() === user.userId);
  if (!isCreator && !isAssignee)
    throw new ApiError(403, "Only the task creator or assignees can edit this task", "FORBIDDEN");

  if (updates.title !== undefined) task.title = updates.title;
  if (updates.description !== undefined) task.description = updates.description;
  if (updates.status !== undefined) task.status = updates.status;
  if (updates.priority !== undefined) task.priority = updates.priority;
  if (updates.assignees !== undefined) {
    if (!isCreator) throw new ApiError(403, "Only the task creator can change assignees", "FORBIDDEN");
    task.assignees = updates.assignees.map((id) => new mongoose.Types.ObjectId(id));
  }

  await task.save();
  const populated = await task.populate([
    { path: "assignees", select: "name email" },
    { path: "createdBy", select: "name email" },
  ]);

  await emitToProject(task.projectId.toString(), EVENTS.TASK_UPDATED, populated.toObject());
  return apiSuccess(populated);
});

export const DELETE = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { taskId } = await params;
  const { task } = await getTaskAndVerifyAccess(taskId, user.userId);

  if (!task.createdBy || task.createdBy.toString() !== user.userId)
    throw new ApiError(403, "Only the task creator can delete this task", "FORBIDDEN");

  const projectId = task.projectId.toString();
  await task.deleteOne();

  await emitToProject(projectId, EVENTS.TASK_DELETED, { taskId });
  return apiSuccess({ deleted: true });
});
```

**Commit:**
```bash
git add .
git commit -m "feat: add tasks API (create, read, update, delete) with real-time emit stubs"
```

---

## Step 9 — Comments API with Cursor Pagination

### `lib/validation/comment.schema.ts`

```typescript
import { z } from "zod";

export const createCommentSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const commentCursorSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

### `app/api/tasks/[taskId]/comments/route.ts`

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Task from "@/lib/db/models/Task";
import Comment from "@/lib/db/models/Comment";
import Project from "@/lib/db/models/Project";
import { createCommentSchema, commentCursorSchema } from "@/lib/validation/comment.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth, encodeCursor, decodeCursor } from "@/lib/api-helpers";
import { emitToProject } from "@/lib/socket/emitter";
import { EVENTS } from "@/lib/socket/events";

interface Params { params: Promise<{ taskId: string }> }

async function verifyTaskAccess(taskId: string, userId: string) {
  if (!mongoose.isValidObjectId(taskId))
    throw new ApiError(400, "Invalid task ID", "INVALID_ID");
  const task = await Task.findById(taskId);
  if (!task) throw new ApiError(404, "Task not found", "NOT_FOUND");
  const project = await Project.findById(task.projectId);
  if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");
  const isMember =
    project.owner.toString() === userId ||
    project.members.some((m) => m.toString() === userId);
  if (!isMember) throw new ApiError(403, "Access denied", "FORBIDDEN");
  return task;
}

export const GET = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { taskId } = await params;
  await verifyTaskAccess(taskId, user.userId);

  const { searchParams } = new URL(req.url);
  const { cursor, limit } = commentCursorSchema.parse({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? 20,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { taskId };
  if (cursor) {
    const { updatedAt, _id } = decodeCursor(cursor);
    filter.$or = [
      { createdAt: { $lt: new Date(updatedAt) } },
      { createdAt: new Date(updatedAt), _id: { $lt: new mongoose.Types.ObjectId(_id) } },
    ];
  }

  const comments = await Comment.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate("authorId", "name email avatarUrl")
    .lean();

  let nextCursor: string | null = null;
  if (comments.length > limit) {
    comments.pop();
    const last = comments[comments.length - 1];
    nextCursor = encodeCursor({ updatedAt: last.createdAt.toISOString(), _id: last._id.toString() });
  }

  return apiSuccess({ comments, nextCursor });
});

export const POST = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { taskId } = await params;
  const task = await verifyTaskAccess(taskId, user.userId);

  const { body: commentBody } = createCommentSchema.parse(await req.json());

  const comment = await Comment.create({ taskId, authorId: user.userId, body: commentBody });

  await Task.findByIdAndUpdate(taskId, {
    $inc: { commentCount: 1 },
    lastCommentAt: new Date(),
  });

  const populated = await comment.populate("authorId", "name email avatarUrl");

  await emitToProject(task.projectId.toString(), EVENTS.COMMENT_CREATED, {
    taskId,
    comment: populated.toObject(),
  });

  return apiSuccess(populated, 201);
});
```

**Commit:**
```bash
git add .
git commit -m "feat: add comments API with cursor-based pagination and real-time emit"
```

---

## Step 10 — Dashboard Query and Search APIs

### Add to `lib/validation/task.schema.ts`

```typescript
export const dashboardQuerySchema = z.object({
  status: z.enum(["todo", "in_progress", "done", "archived"]).optional(),
  assignee: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

### `lib/validation/search.schema.ts`

```typescript
import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  projectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
```

### `app/api/projects/[projectId]/dashboard/route.ts`

Paginated task listing with optional status/assignee filter:

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Project from "@/lib/db/models/Project";
import Task from "@/lib/db/models/Task";
import { dashboardQuerySchema } from "@/lib/validation/task.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth, encodeCursor, decodeCursor } from "@/lib/api-helpers";

interface Params { params: Promise<{ projectId: string }> }

export const GET = withAuth(async (req: NextRequest, { params }: Params) => {
  const user = getAuthUser(req);
  const { projectId } = await params;

  if (!mongoose.isValidObjectId(projectId))
    throw new ApiError(400, "Invalid project ID", "INVALID_ID");

  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, "Project not found", "NOT_FOUND");

  const isMember =
    project.owner.toString() === user.userId ||
    project.members.some((m) => m.toString() === user.userId);
  if (!isMember) throw new ApiError(403, "Access denied", "FORBIDDEN");

  const { searchParams } = new URL(req.url);
  const query = dashboardQuerySchema.parse({
    status: searchParams.get("status") ?? undefined,
    assignee: searchParams.get("assignee") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? 20,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { projectId };
  if (query.status) filter.status = query.status;
  if (query.assignee) filter.assignees = query.assignee;

  if (query.cursor) {
    const { updatedAt, _id } = decodeCursor(query.cursor);
    filter.$or = [
      { updatedAt: { $lt: new Date(updatedAt) } },
      { updatedAt: new Date(updatedAt), _id: { $lt: new mongoose.Types.ObjectId(_id) } },
    ];
  }

  const tasks = await Task.find(filter)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .populate("assignees", "name email")
    .populate("createdBy", "name email")
    .lean();

  let nextCursor: string | null = null;
  if (tasks.length > query.limit) {
    tasks.pop();
    const last = tasks[tasks.length - 1];
    nextCursor = encodeCursor({ updatedAt: last.updatedAt.toISOString(), _id: last._id.toString() });
  }

  return apiSuccess({ tasks, nextCursor, count: tasks.length });
});
```

### `app/api/search/route.ts`

Full-text search across tasks and comments the user has access to:

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import Task from "@/lib/db/models/Task";
import Comment from "@/lib/db/models/Comment";
import Project from "@/lib/db/models/Project";
import { searchQuerySchema } from "@/lib/validation/search.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth } from "@/lib/api-helpers";

export const GET = withAuth(async (req: NextRequest) => {
  const user = getAuthUser(req);
  const { searchParams } = new URL(req.url);
  const { q, projectId, limit } = searchQuerySchema.parse({
    q: searchParams.get("q") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
    limit: searchParams.get("limit") ?? 20,
  });

  const accessibleProjects = await Project.find({
    $or: [{ owner: user.userId }, { members: user.userId }],
  }).select("_id");

  if (projectId) {
    if (!mongoose.isValidObjectId(projectId))
      throw new ApiError(400, "Invalid project ID", "INVALID_ID");
    if (!accessibleProjects.map((p) => p._id.toString()).includes(projectId))
      throw new ApiError(403, "Access denied", "FORBIDDEN");
  }

  const projectFilter = projectId
    ? [new mongoose.Types.ObjectId(projectId)]
    : accessibleProjects.map((p) => p._id);

  const [taskResults, commentResults] = await Promise.all([
    Task.find({ $text: { $search: q }, projectId: { $in: projectFilter } })
      .select({ score: { $meta: "textScore" }, title: 1, description: 1, status: 1, projectId: 1, assignees: 1 })
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .populate("assignees", "name email")
      .lean(),

    Comment.find({
      $text: { $search: q },
      taskId: { $in: await Task.find({ projectId: { $in: projectFilter } }).distinct("_id") },
    })
      .select({ score: { $meta: "textScore" }, body: 1, taskId: 1, authorId: 1, createdAt: 1 })
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .populate("authorId", "name email")
      .lean(),
  ]);

  return apiSuccess({
    tasks: taskResults.map((t) => ({ ...t, type: "task" })),
    comments: commentResults.map((c) => ({ ...c, type: "comment" })),
    query: q,
  });
});
```

**Commit:**
```bash
git add .
git commit -m "feat: add dashboard task query API and full-text search endpoint"
```

---

## Step 11 — Profile API

### `lib/validation/profile.schema.ts`

```typescript
import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
```

### `app/api/profile/route.ts`

```typescript
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
  const updates = updateProfileSchema.parse(await req.json());
  const user = await User.findByIdAndUpdate(
    auth.userId,
    { $set: updates },
    { new: true, runValidators: true }
  ).select("-passwordHash");
  if (!user) throw new Error("User not found");
  return apiSuccess(user);
});
```

### `app/api/profile/password/route.ts`

```typescript
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import User from "@/lib/db/models/User";
import { changePasswordSchema } from "@/lib/validation/profile.schema";
import { apiSuccess, getAuthUser, ApiError, withAuth } from "@/lib/api-helpers";

export const POST = withAuth(async (req: NextRequest) => {
  const auth = getAuthUser(req);
  const { currentPassword, newPassword } = changePasswordSchema.parse(await req.json());

  const user = await User.findById(auth.userId);
  if (!user) throw new ApiError(404, "User not found", "NOT_FOUND");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new ApiError(401, "Current password is incorrect", "INVALID_CREDENTIALS");

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();
  return apiSuccess({ changed: true });
});
```

**Commit:**
```bash
git add .
git commit -m "feat: add profile view, update, and change-password endpoints"
```

---

## Step 12 — Custom Node Server with Socket.io

### Why a custom server?

Next.js's built-in server doesn't expose the underlying `http.Server` instance, which
Socket.io needs to attach to. We replace `next dev` with a small custom server that:
1. Starts Next.js programmatically
2. Gets the `http.Server` handle
3. Attaches Socket.io to that server

### `lib/socket/events.ts`

Define all event names in one place so client and server always stay in sync:

```typescript
export const EVENTS = {
  TASK_CREATED:    "task:created",
  TASK_UPDATED:    "task:updated",
  TASK_DELETED:    "task:deleted",
  COMMENT_CREATED: "comment:created",
  PRESENCE_UPDATE: "presence:update",
  JOIN_PROJECT:    "project:join",
  LEAVE_PROJECT:   "project:leave",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
```

### `lib/socket/emitter.ts`

Used by API routes to push events to connected clients without importing the full
server module (avoids circular dependencies):

```typescript
import { getSocketServer } from "./server";

export async function emitToProject(projectId: string, event: string, data: unknown) {
  const io = getSocketServer();
  if (!io) return;
  io.to(`project:${projectId}`).emit(event, data);
}
```

### `lib/socket/server.ts`

Full Socket.io server with:
- JWT authentication middleware
- Per-project room management
- In-memory presence tracking
- Optional Redis pub/sub adapter for horizontal scaling

```typescript
import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { verifyToken } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/db/connect";
import User from "@/lib/db/models/User";
import { EVENTS } from "./events";

declare global {
  var _socketIO: SocketServer | undefined;
}

interface PresenceEntry {
  userId: string;
  name: string;
  email: string;
  socketId: string;
  joinedAt: string;
}

const presenceMap = new Map<string, Map<string, PresenceEntry>>();

function getProjectPresence(projectId: string): PresenceEntry[] {
  return Array.from(presenceMap.get(projectId)?.values() ?? []);
}

function addPresence(projectId: string, entry: PresenceEntry) {
  if (!presenceMap.has(projectId)) presenceMap.set(projectId, new Map());
  presenceMap.get(projectId)!.set(entry.userId, entry);
}

function removePresence(projectId: string, userId: string) {
  presenceMap.get(projectId)?.delete(userId);
}

export async function initSocketServer(httpServer: HttpServer): Promise<SocketServer> {
  if (global._socketIO) return global._socketIO;

  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Optional Redis adapter — attach only if REDIS_URL is set
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const pubClient = createClient({ url: redisUrl });
      await pubClient.connect();
      const subClient = pubClient.duplicate();
      await subClient.connect();
      io.adapter(createAdapter(pubClient, subClient));
      console.log("[Socket] Redis adapter attached");
    } catch (err) {
      console.warn("[Socket] Redis adapter failed, using in-memory adapter:", err);
    }
  }

  // JWT auth middleware — runs before every connection
  io.use(async (socket: Socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string) ||
        (socket.handshake.headers?.authorization as string)?.replace("Bearer ", "");
      if (!token) return next(new Error("Authentication required"));

      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      socket.data.email = payload.email;

      await connectDB();
      const user = await User.findById(payload.userId).select("name email");
      if (!user) return next(new Error("User not found"));
      socket.data.name = user.name;

      await User.findByIdAndUpdate(payload.userId, { lastActiveAt: new Date() });
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const { userId, name, email } = socket.data as { userId: string; name: string; email: string };
    const joinedProjects = new Set<string>();

    socket.on(EVENTS.JOIN_PROJECT, (projectId: string) => {
      if (!projectId) return;
      socket.join(`project:${projectId}`);
      joinedProjects.add(projectId);
      addPresence(projectId, { userId, name, email, socketId: socket.id, joinedAt: new Date().toISOString() });
      io.to(`project:${projectId}`).emit(EVENTS.PRESENCE_UPDATE, {
        projectId,
        users: getProjectPresence(projectId),
      });
    });

    socket.on(EVENTS.LEAVE_PROJECT, (projectId: string) => {
      if (!projectId) return;
      socket.leave(`project:${projectId}`);
      joinedProjects.delete(projectId);
      removePresence(projectId, userId);
      io.to(`project:${projectId}`).emit(EVENTS.PRESENCE_UPDATE, {
        projectId,
        users: getProjectPresence(projectId),
      });
    });

    socket.on("disconnect", () => {
      for (const projectId of joinedProjects) {
        removePresence(projectId, userId);
        io.to(`project:${projectId}`).emit(EVENTS.PRESENCE_UPDATE, {
          projectId,
          users: getProjectPresence(projectId),
        });
      }
      joinedProjects.clear();
    });
  });

  global._socketIO = io;
  return io;
}

export function getSocketServer(): SocketServer | undefined {
  return global._socketIO;
}
```

### `server.ts` (project root)

```typescript
import 'dotenv/config';
import { createServer } from "http";
import next from "next";
import { initSocketServer } from "./lib/socket/server";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  initSocketServer(httpServer)
    .then(() => console.log("[Server] Socket.io initialized"))
    .catch((err) => console.error("[Server] Failed to initialize Socket.io:", err));

  httpServer.listen(port, () => {
    console.log(`[Server] Ready on http://localhost:${port}`);
  });
});
```

Start the server:

```bash
npm run dev
# Output:
# [Server] Socket.io initialized
# [Server] Ready on http://localhost:3000
```

**Commit:**
```bash
git add .
git commit -m "feat: add custom Node HTTP server integrating Next.js and Socket.io"
```

---

## Step 13 — Socket.io Client Hook

### `hooks/useSocket.ts`

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { EVENTS } from "@/lib/socket/events";

export interface PresenceUser {
  userId: string;
  name: string;
  email: string;
  socketId: string;
  joinedAt: string;
}

interface UseSocketOptions {
  projectId?: string;
  onTaskCreated?: (task: unknown) => void;
  onTaskUpdated?: (task: unknown) => void;
  onTaskDeleted?: (data: { taskId: string }) => void;
  onCommentCreated?: (data: { taskId: string; comment: unknown }) => void;
  onPresenceUpdate?: (data: { projectId: string; users: PresenceUser[] }) => void;
}

export function useSocket({
  projectId,
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onCommentCreated,
  onPresenceUpdate,
}: UseSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3000";
    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      if (projectId) socket.emit(EVENTS.JOIN_PROJECT, projectId);
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on(EVENTS.TASK_CREATED, (task) => onTaskCreated?.(task));
    socket.on(EVENTS.TASK_UPDATED, (task) => onTaskUpdated?.(task));
    socket.on(EVENTS.TASK_DELETED, (data) => onTaskDeleted?.(data));
    socket.on(EVENTS.COMMENT_CREATED, (data) => onCommentCreated?.(data));
    socket.on(EVENTS.PRESENCE_UPDATE, (data: { projectId: string; users: PresenceUser[] }) => {
      setPresenceUsers(data.users);
      onPresenceUpdate?.(data);
    });

    return () => {
      if (projectId) socket.emit(EVENTS.LEAVE_PROJECT, projectId);
      socket.disconnect();
    };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { socket: socketRef.current, connected, presenceUsers };
}
```

**How the hook works:**
1. Reads the JWT from `localStorage` (set during login)
2. Connects to the Socket.io server, passing the JWT in `auth`
3. Joins the `project:<id>` room automatically when `projectId` is provided
4. Returns `connected` state, live `presenceUsers`, and the raw `socket` ref
5. Cleans up on unmount by leaving the project room and disconnecting

**Commit:**
```bash
git add .
git commit -m "feat: add useSocket hook for real-time task, comment, and presence events"
```

---

## Step 14 — Login and Register Pages

### `app/layout.tsx`

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Task Manager",
  description: "Real-time collaborative task management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
```

### `app/(auth)/register/page.tsx`

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error?.message ?? "Registration failed"); return; }
      localStorage.setItem("token", json.data.token);
      localStorage.setItem("user", JSON.stringify(json.data.user));
      router.push("/projects");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-gray-900 rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold mb-6">Create account</h1>
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full bg-gray-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Your name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            type="email"
            className="w-full bg-gray-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Email address"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            type="password"
            className="w-full bg-gray-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Password (min 8 characters)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-lg py-2 font-semibold transition disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
        <p className="text-sm text-gray-400 mt-4 text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-400 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
```

### `app/(auth)/login/page.tsx`

Similar to register but calls `/api/auth/login` with just `email` + `password`.

**Commit:**
```bash
git add .
git commit -m "feat: add login and register pages with JWT token storage"
```

---

## Step 15 — Projects Listing Page

### `lib/api-client.ts`

A thin wrapper so pages don't repeat the `Authorization` header boilerplate:

```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: true; data: T } | { success: false; error: { message: string; code: string } }> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  return res.json();
}
```

### `app/projects/page.tsx`

Displays a list of projects the user owns or is a member of. Includes a "New Project"
modal that calls `POST /api/projects`.

Key logic:
```tsx
const res = await apiFetch<Project[]>("/api/projects");
if (res.success) setProjects(res.data);
```

**Commit:**
```bash
git add .
git commit -m "feat: add projects listing page with create project modal"
```

---

## Step 16 — Project Dashboard Page

`app/dashboard/[projectId]/page.tsx` is the most complex page. It:

1. Fetches project details and task list from `GET /api/projects/[projectId]/dashboard`
2. Organises tasks into four columns: `todo`, `in_progress`, `done`, `archived`
3. Connects to Socket.io via `useSocket` to receive live task updates
4. Shows a `PresenceBar` of who else is currently viewing the project

### Kanban board state pattern

```tsx
type Column = "todo" | "in_progress" | "done" | "archived";

const [columns, setColumns] = useState<Record<Column, Task[]>>({
  todo: [],
  in_progress: [],
  done: [],
  archived: [],
});

// On task created via socket
function handleTaskCreated(task: Task) {
  setColumns((prev) => ({
    ...prev,
    [task.status]: [task, ...prev[task.status]],
  }));
}

// On task updated via socket (may have changed columns)
function handleTaskUpdated(updated: Task) {
  setColumns((prev) => {
    const next = { ...prev };
    // Remove from all columns first
    for (const col of Object.keys(next) as Column[]) {
      next[col] = next[col].filter((t) => t._id !== updated._id);
    }
    // Add to the correct column
    next[updated.status] = [updated, ...next[updated.status]];
    return next;
  });
}
```

### `components/TaskCard.tsx`

Compact card showing title, priority badge, assignee avatars, and comment count.
Clicking opens the `TaskModal`.

### `components/PresenceBar.tsx`

```tsx
// Shows avatars of all users currently viewing the project
{presenceUsers.map((u) => (
  <div key={u.userId} title={u.name} className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">
    {u.name[0].toUpperCase()}
  </div>
))}
```

**Commit:**
```bash
git add .
git commit -m "feat: add project dashboard with Kanban board and real-time presence bar"
```

---

## Step 17 — Task Modal with Comments

`components/TaskModal.tsx` is a slide-over panel that:

1. Shows full task details (title, description, status, assignees, priority)
2. Lets the task creator or assignees edit fields inline
3. Loads comments via `GET /api/tasks/[taskId]/comments`
4. Listens for `comment:created` socket events to append new comments instantly

### Comment polling vs real-time

```tsx
// Load initial comments on open
useEffect(() => {
  if (!task) return;
  apiFetch<{ comments: Comment[] }>(`/api/tasks/${task._id}/comments`)
    .then((res) => { if (res.success) setComments(res.data.comments); });
}, [task?._id]);

// Append new comments from other users via socket
useSocket({
  onCommentCreated: ({ taskId, comment }) => {
    if (taskId === task?._id) {
      setComments((prev) => [comment, ...prev]);
    }
  },
});
```

### `components/CommentThread.tsx`

Renders comments in reverse-chronological order. Each comment shows author avatar,
name, relative time, and body text.

**Commit:**
```bash
git add .
git commit -m "feat: add task detail modal with inline editing and real-time comment thread"
```

---

## Step 18 — Profile Page

`app/profile/page.tsx`:

1. Fetches current user from `GET /api/profile`
2. Allows editing name and avatar URL via `PATCH /api/profile`
3. Change password form posts to `POST /api/profile/password`

```tsx
async function saveProfile() {
  const res = await apiFetch("/api/profile", {
    method: "PATCH",
    body: JSON.stringify({ name, avatarUrl }),
  });
  if (res.success) {
    // Update cached user in localStorage
    localStorage.setItem("user", JSON.stringify(res.data));
    setSuccess("Profile updated");
  }
}
```

**Commit:**
```bash
git add .
git commit -m "feat: add profile page with name/avatar editing and password change"
```

---

## Final Structure

```
task-manager/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   └── register/route.ts
│   │   ├── profile/
│   │   │   ├── route.ts
│   │   │   └── password/route.ts
│   │   ├── projects/
│   │   │   ├── route.ts
│   │   │   └── [projectId]/
│   │   │       ├── route.ts
│   │   │       ├── dashboard/route.ts
│   │   │       ├── members/route.ts
│   │   │       └── tasks/route.ts
│   │   ├── tasks/
│   │   │   └── [taskId]/
│   │   │       ├── route.ts
│   │   │       └── comments/route.ts
│   │   └── search/route.ts
│   ├── dashboard/[projectId]/page.tsx
│   ├── profile/page.tsx
│   ├── projects/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── CommentThread.tsx
│   ├── PresenceBar.tsx
│   ├── TaskBoard.tsx
│   ├── TaskCard.tsx
│   └── TaskModal.tsx
├── hooks/
│   └── useSocket.ts
├── lib/
│   ├── api-client.ts
│   ├── api-helpers.ts
│   ├── auth/
│   │   └── jwt.ts
│   ├── db/
│   │   ├── connect.ts
│   │   └── models/
│   │       ├── Comment.ts
│   │       ├── Project.ts
│   │       ├── Task.ts
│   │       └── User.ts
│   ├── socket/
│   │   ├── emitter.ts
│   │   ├── events.ts
│   │   └── server.ts
│   └── validation/
│       ├── auth.schema.ts
│       ├── comment.schema.ts
│       ├── member.schema.ts
│       ├── profile.schema.ts
│       ├── search.schema.ts
│       └── task.schema.ts
├── middleware.ts
├── server.ts
└── .env.local
```

---

## Running the Project

```bash
# Development
npm run dev

# Production build
npm run build
npm run start
```

---

## Key Design Decisions

| Decision | Why |
|---|---|
| Custom `server.ts` instead of Next.js API route for Socket.io | Socket.io needs the raw `http.Server` to attach, which Next.js doesn't expose |
| `jose` in middleware, `jsonwebtoken` in routes | Middleware runs on Edge runtime (Web Crypto only); routes run on Node |
| Cursor-based pagination over offset | Stable under concurrent inserts; no "page drift" when tasks are added |
| Global `mongooseCache` on `globalThis` | Survives Next.js hot reload — prevents connection exhaustion in dev |
| `emitToProject` helper separate from socket server | API routes import only the emitter, not the full server setup |
| Redis adapter is optional | Works out of the box with a single server; add Redis for multi-instance deployments |
