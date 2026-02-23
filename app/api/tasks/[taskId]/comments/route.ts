import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connect";
import Task from "@/lib/db/models/Task";
import Comment from "@/lib/db/models/Comment";
import Project from "@/lib/db/models/Project";
import { createCommentSchema, commentCursorSchema } from "@/lib/validation/comment.schema";
import { apiSuccess, apiError, getAuthUser, ApiError, encodeCursor, decodeCursor } from "@/lib/api-helpers";
import { emitToProject } from "@/lib/socket/emitter";
import { EVENTS } from "@/lib/socket/events";

interface Params {
  params: Promise<{ taskId: string }>;
}

async function verifyTaskAccess(taskId: string, userId: string) {
  if (!mongoose.isValidObjectId(taskId)) {
    throw new ApiError(400, "Invalid task ID", "INVALID_ID");
  }
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

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    const { taskId } = await params;
    await verifyTaskAccess(taskId, user.userId);

    const { searchParams } = new URL(req.url);
    const { cursor, limit } = commentCursorSchema.parse({
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? 20,
    });

    type CommentFilter = {
      taskId: string;
      $or?: Array<
        | { createdAt: { $lt: Date } }
        | { createdAt: Date; _id: { $lt: mongoose.Types.ObjectId } }
      >;
    };

    const filter: CommentFilter = { taskId };
    if (cursor) {
      const { updatedAt, _id } = decodeCursor(cursor);
      filter.$or = [
        { createdAt: { $lt: new Date(updatedAt) } },
        {
          createdAt: new Date(updatedAt),
          _id: { $lt: new mongoose.Types.ObjectId(_id) },
        },
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
      nextCursor = encodeCursor({
        updatedAt: last.createdAt.toISOString(),
        _id: last._id.toString(),
      });
    }

    return apiSuccess({ comments, nextCursor });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    const { taskId } = await params;
    const task = await verifyTaskAccess(taskId, user.userId);

    const body = await req.json();
    const { body: commentBody } = createCommentSchema.parse(body);

    const comment = await Comment.create({
      taskId,
      authorId: user.userId,
      body: commentBody,
    });

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
  } catch (error) {
    return apiError(error);
  }
}
