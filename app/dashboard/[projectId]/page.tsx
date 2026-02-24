"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, Task, Project, Comment } from "@/lib/api-client";
import { TaskBoard } from "@/components/TaskBoard";
import { TaskModal } from "@/components/TaskModal";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { PresenceBar } from "@/components/PresenceBar";
import { useSocket } from "@/hooks/useSocket";

export default function DashboardPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Task[] | null>(null);
  const [newComment, setNewComment] = useState<Comment | undefined>(undefined);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState("");

  const handleTaskCreated = useCallback((task: unknown) => {
    setTasks((prev) => {
      const t = task as Task;
      const exists = prev.some((x) => x._id === t._id);
      if (exists) return prev;
      return [t, ...prev];
    });
  }, []);

  const handleTaskUpdated = useCallback((task: unknown) => {
    const t = task as Task;
    setTasks((prev) => prev.map((x) => (x._id === t._id ? t : x)));
    setSelectedTask((sel) => (sel?._id === t._id ? t : sel));
  }, []);

  const handleTaskDeleted = useCallback(({ taskId }: { taskId: string }) => {
    setTasks((prev) => prev.filter((x) => x._id !== taskId));
    setSelectedTask((sel) => (sel?._id === taskId ? null : sel));
  }, []);

  const handleCommentCreated = useCallback(
    (data: { taskId: string; comment: unknown }) => {
      if (selectedTask?._id === data.taskId) {
        setNewComment(data.comment as Comment);
      }
      setTasks((prev) =>
        prev.map((t) =>
          t._id === data.taskId
            ? { ...t, commentCount: t.commentCount + 1, lastCommentAt: new Date().toISOString() }
            : t
        )
      );
    },
    [selectedTask]
  );

  const { connected, presenceUsers } = useSocket({
    projectId,
    onTaskCreated: handleTaskCreated,
    onTaskUpdated: handleTaskUpdated,
    onTaskDeleted: handleTaskDeleted,
    onCommentCreated: handleCommentCreated,
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    loadData();
  }, [projectId, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [proj, dashboard] = await Promise.all([
        api.projects.get(projectId),
        api.projects.dashboard(projectId, {
          status: statusFilter || undefined,
          limit: 50,
        }),
      ]);
      setProject(proj);
      setTasks(dashboard.tasks);
      setNextCursor(dashboard.nextCursor);
    } catch {
      router.push("/");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    const result = await api.projects.dashboard(projectId, {
      status: statusFilter || undefined,
      cursor: nextCursor,
      limit: 50,
    });
    setTasks((prev) => [...prev, ...result.tasks]);
    setNextCursor(result.nextCursor);
  }

  async function handleSearch() {
    if (!searchQ.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const { tasks: results } = await api.search(searchQ, projectId);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberError("");
    if (!addMemberEmail.trim()) return;
    setAddingMember(true);
    try {
      const updated = await api.projects.addMember(projectId, addMemberEmail.trim());
      setProject(updated);
      setAddMemberEmail("");
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  const displayedTasks = searchResults ?? tasks;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-gray-400 hover:text-gray-600 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-gray-900 truncate">
                {project?.name ?? "Loading..."}
              </h1>
              {project?.description && (
                <p className="text-xs text-gray-400 truncate">{project.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="flex gap-1">
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQ}
                onChange={(e) => {
                  setSearchQ(e.target.value);
                  if (!e.target.value) setSearchResults(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button
                onClick={handleSearch}
                className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">All statuses</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="archived">Archived</option>
            </select>

            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Task
            </button>
          </div>
        </div>

        {/* Presence bar */}
        <PresenceBar users={presenceUsers} connected={connected} />
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {searchResults !== null && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchQ}&rdquo;
            </span>
            <button
              onClick={() => { setSearchResults(null); setSearchQ(""); }}
              className="text-xs text-indigo-600 hover:underline"
            >
              Clear
            </button>
          </div>
        )}

        <TaskBoard tasks={displayedTasks} onTaskClick={setSelectedTask} loading={loading} />

        {nextCursor && !searchResults && (
          <div className="text-center mt-6">
            <button
              onClick={loadMore}
              className="px-5 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Load more tasks
            </button>
          </div>
        )}

        {/* Add member section */}
        {project && (
          <div className="mt-8 bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Project Members</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {project.members.map((m) => (
                <span
                  key={m._id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm"
                >
                  <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center">
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                  {m.name}
                  {m._id === project.owner._id && (
                    <span className="text-xs text-indigo-400">(owner)</span>
                  )}
                </span>
              ))}
            </div>
            <form onSubmit={handleAddMember} className="flex gap-2 max-w-sm">
              <input
                type="email"
                placeholder="Add member by email"
                value={addMemberEmail}
                onChange={(e) => setAddMemberEmail(e.target.value)}
                className="flex-1 border border-gray-200 text-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button
                type="submit"
                disabled={addingMember}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {addingMember ? "..." : "Add"}
              </button>
            </form>
            {memberError && <p className="text-sm text-red-500 mt-1">{memberError}</p>}
          </div>
        )}
      </main>

      {/* Task detail modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => { setSelectedTask(null); setNewComment(undefined); }}
          onUpdate={(updated) => {
            setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
            setSelectedTask(updated);
          }}
          onDelete={(id) => {
            setTasks((prev) => prev.filter((t) => t._id !== id));
            setSelectedTask(null);
          }}
          newComment={newComment}
        />
      )}

      {/* Create task modal */}
      {showCreate && (
        <CreateTaskModal
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={(task) => setTasks((prev) => [task, ...prev])}
        />
      )}
    </div>
  );
}

