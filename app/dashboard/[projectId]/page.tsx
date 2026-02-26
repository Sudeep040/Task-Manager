"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, Task, Project, Comment } from "@/lib/api-client";
import { TaskModal } from "@/components/TaskModal";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { UserAvatar } from "@/components/UserAvatar";
import { useSocket } from "@/hooks/useSocket";

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  archived: "bg-yellow-100 text-yellow-700",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  archived: "Archived",
};

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Critical", color: "text-red-600" },
  2: { label: "High", color: "text-orange-500" },
  3: { label: "Medium", color: "text-yellow-600" },
  4: { label: "Low", color: "text-blue-500" },
  5: { label: "Minimal", color: "text-gray-400" },
};

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
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Task[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [newComment, setNewComment] = useState<Comment | undefined>(undefined);
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [availableUsers, setAvailableUsers] = useState<{ _id: string; name: string; email: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [loadingUsers, setLoadingUsers] = useState(false);

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

  const onlineUserIds = new Set(presenceUsers.map((u) => u.userId));
  const currentUserId =
    typeof window !== "undefined"
      ? (JSON.parse(localStorage.getItem("user") || "{}") as { id?: string }).id ?? ""
      : "";

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    setSearchResults(null);
    loadData();
  }, [projectId, statusFilter, assigneeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [proj, dashboard] = await Promise.all([
        api.projects.get(projectId),
        api.projects.dashboard(projectId, {
          status: statusFilter || undefined,
          assignee: assigneeFilter || undefined,
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
      assignee: assigneeFilter || undefined,
      cursor: nextCursor,
      limit: 50,
    });
    setTasks((prev) => [...prev, ...result.tasks]);
    setNextCursor(result.nextCursor);
  }

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!searchQ.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const { tasks: results } = await api.search(searchQ, projectId);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setSearchLoading(false);
    }
  }

  function clearSearch() {
    setSearchResults(null);
    setSearchQ("");
  }

  // Fetch available users (exclude current project members)
  useEffect(() => {
    let cancelled = false;
    async function loadUsers() {
      if (!project) {
        setAvailableUsers([]);
        return;
      }
      setLoadingUsers(true);
      try {
        const users = await api.users.list({ projectId });
        if (cancelled) return;
        const filtered = (users as { _id: string; name: string; email: string }[]).filter(
          (u) => !project.members.some((m) => m._id === u._id)
        );
        setAvailableUsers(filtered);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    }
    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [project, projectId]);

  async function handleAddMemberById(e: React.FormEvent) {
    e.preventDefault();
    setMemberError("");
    if (!selectedUserId) {
      setMemberError("Select a user to add");
      return;
    }
    setAddingMember(true);
    try {
      const user = availableUsers.find((u) => u._id === selectedUserId);
      if (!user) throw new Error("User not found");
      const updated = await api.projects.addMember(projectId, user.email);
      setProject(updated);
      try {
        window.dispatchEvent(new CustomEvent("project:members:updated", { detail: updated }));
      } catch {
        // ignore (server-side or non-browser)
      }
      setSelectedUserId("");
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm("Remove this member from the project?")) return;
    setMemberError("");
    setRemovingMemberId(userId);
    try {
      await api.projects.removeMember(projectId, userId);
      const updated = await api.projects.get(projectId);
      setProject(updated);
      try {
        window.dispatchEvent(new CustomEvent("project:members:updated", { detail: updated }));
      } catch {
        // ignore
      }
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemovingMemberId(null);
    }
  }

  const displayedTasks = searchResults ?? tasks;
  const uniqueDisplayedTasks = useMemo(() => {
    const seen = new Map<string, Task>();
    for (const t of displayedTasks) {
      if (!seen.has(t._id)) seen.set(t._id, t);
    }
    return Array.from(seen.values());
  }, [displayedTasks]);

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
            <Link
              href="/profile"
              className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold flex items-center justify-center hover:bg-indigo-200 transition-colors shrink-0"
              title="My Profile"
            >
              {project?.members?.find(m => m.email === (typeof window !== "undefined" ? JSON.parse(localStorage.getItem("user") || "{}").email : ""))?.name?.charAt(0).toUpperCase() ?? "U"}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center pb-4 gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 text-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">All statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="archived">Archived</option>
          </select>

          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="border border-gray-200 text-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">All assignees</option>
            {project?.members.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-sm">
            <div className="relative flex-1">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                type="text"
                value={searchQ}
                onChange={(e) => {
                  setSearchQ(e.target.value);
                  if (!e.target.value.trim()) setSearchResults(null);
                }}
                placeholder="Search tasks & comments…"
                className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <button
              type="submit"
              disabled={searchLoading || !searchQ.trim()}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {searchLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : "Search"}
            </button>
          </form>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors ml-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Task
          </button>
        </div>

        {searchResults !== null && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchQ}&rdquo;
            </span>
            <button onClick={clearSearch} className="text-xs text-indigo-600 hover:underline">
              Clear
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: main content */}
          <div className="flex-1">
            {/* Tasks table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[40%]">Task</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assignees</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Updated</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        Loading…
                      </td>
                    </tr>
                  ) : uniqueDisplayedTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        No tasks yet.
                      </td>
                    </tr>
                  ) : (
                    uniqueDisplayedTasks.map((task) => {
                      const priority = PRIORITY_LABELS[task.priority] ?? PRIORITY_LABELS[3];
                      const canEdit =
                        !!(
                          currentUserId &&
                          (currentUserId === task.createdBy._id || task.assignees.some((a) => a._id === currentUserId))
                        );
                      return (
                        <tr key={task._id} className="hover:bg-indigo-50/40 transition-colors group">
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedTask(task)}
                              className="font-medium text-gray-900 group-hover:text-indigo-700 transition-colors line-clamp-1 text-left"
                            >
                              {task.title}
                            </button>
                          </td>

                          <td className="px-4 py-3">
                            {task.assignees.length === 0 ? (
                              <span className="text-xs text-gray-400">N/A</span>
                            ) : (
                              <span className="text-sm text-gray-700">{task.assignees.map((a) => a.name).join(", ")}</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap min-w-[5.5rem] ${STATUS_COLORS[task.status]}`}
                            >
                              {STATUS_LABELS[task.status]}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium ${priority.color}`}>{priority.label}</span>
                          </td>

                          <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                            {task.dueAt ? new Date(task.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                          </td>

                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {new Date(task.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </td>

                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedTask(task)}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700 transition-colors"
                            >
                              {canEdit ? "Edit" : "View"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

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
          </div>

          {/* Right: sidebar */}
          <aside className="w-full lg:w-80">
            {project && (
              <div className="lg:mt-0 mt-6 bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Project Members</h2>
                <div className="flex flex-wrap gap-2 mb-4">
                  {project.members.map((m) => (
                    <span
                      key={m._id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm"
                    >
                      <UserAvatar name={m.name} isOnline={onlineUserIds.has(m._id)} size="sm" />
                      <span className="truncate max-w-xs">{m.name}</span>
                      {onlineUserIds.has(m._id) && (
                        <span className="text-xs text-emerald-600 font-medium">online</span>
                      )}
                      {m._id === project.owner._id && (
                        <span className="text-xs text-indigo-400">(owner)</span>
                      )}
                      {currentUserId && project.owner._id === currentUserId && m._id !== project.owner._id && (
                        <button
                          onClick={() => handleRemoveMember(m._id)}
                          disabled={removingMemberId === m._id}
                          title="Remove member"
                          className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full text-red-500 hover:bg-red-50 transition-colors"
                        >
                          {removingMemberId === m._id ? (
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {currentUserId && project.owner._id === currentUserId && (
                  <form onSubmit={handleAddMemberById} className="flex gap-2 max-w-sm">
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="flex-1 border border-gray-200 text-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">{loadingUsers ? "Loading users..." : "Select a user to add"}</option>
                      {availableUsers.map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={addingMember || !selectedUserId}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {addingMember ? "..." : "Add"}
                    </button>
                  </form>
                )}
                {memberError && <p className="text-sm text-red-500 mt-1">{memberError}</p>}
              </div>
            )}
          </aside>
        </div>
      </main>

      {/* Task detail modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          projectMembers={project?.members ?? []}
          currentUserId={currentUserId}
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
          onlineUserIds={onlineUserIds}
        />
      )}

      {/* Create task modal */}
      {showCreate && (
        <CreateTaskModal
          projectId={projectId}
          members={project?.members ?? []}
          onClose={() => setShowCreate(false)}
          onCreated={(task) => setTasks((prev) => [task, ...prev])}
        />
      )}
    </div>
  );
}
