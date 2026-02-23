 "use client";
 
 import { useState, useEffect } from "react";
 import { api, Comment } from "@/lib/api-client";
 
 interface CommentThreadProps {
   taskId: string;
   newComment?: Comment;
 }
 
 export function CommentThread({ taskId, newComment }: CommentThreadProps) {
   const [comments, setComments] = useState<Comment[]>([]);
   const [body, setBody] = useState("");
   const [loading, setLoading] = useState(true);
   const [submitting, setSubmitting] = useState(false);
   const [nextCursor, setNextCursor] = useState<string | null>(null);
 
  useEffect(() => {
    api.comments.list(taskId).then(({ comments, nextCursor }) => {
      setComments(comments);
      setNextCursor(nextCursor);
      setLoading(false);
    });
  }, [taskId]);

  // Append real-time comment from socket
  useEffect(() => {
    if (!newComment) return;
    setComments((prev) => {
      const exists = prev.some((c) => c._id === newComment._id);
      if (exists) return prev;
      return [newComment, ...prev];
    });
  }, [newComment]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const comment = await api.comments.create(taskId, body.trim());
      setComments((prev) => [comment, ...prev]);
      setBody("");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    const result = await api.comments.list(taskId, nextCursor);
    setComments((prev) => [...prev, ...result.comments]);
    setNextCursor(result.nextCursor);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="Add a comment..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? "..." : "Post"}
        </button>
      </form>

      {loading && <p className="text-sm text-gray-400 animate-pulse">Loading comments...</p>}

      <div className="flex flex-col gap-3">
        {comments.map((comment) => (
          <div key={comment._id} className="flex gap-3">
            <div className="w-8 h-8 shrink-0 rounded-full bg-indigo-400 flex items-center justify-center text-white text-sm font-medium">
              {comment.authorId.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-800">{comment.authorId.name}</span>
                <span className="text-xs text-gray-400">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.body}</p>
            </div>
          </div>
        ))}
      </div>

      {nextCursor && (
        <button
          onClick={loadMore}
          className="text-sm text-indigo-600 hover:underline self-center mt-1"
        >
          Load more comments
        </button>
      )}

      {!loading && comments.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          No comments yet. Be the first to comment!
        </p>
      )}
    </div>
  );
}
