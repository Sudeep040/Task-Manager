"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, Project, TaskWithProject } from "@/lib/api-client";

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

export default function HomePage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addForm, setAddForm] = useState({ projectId: "", title: "", description: "", priority: 3 });
  const [addAssigneeId, setAddAssigneeId] = useState<string>("");
  const [addDueAt, setAddDueAt] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [tasksRes, projectsRes] = await Promise.all([
        api.tasks.list(),
        api.projects.list(),
      ]);
      setTasks(tasksRes.tasks);
      setProjects(projectsRes);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!addForm.projectId) { setAddError("Please select a project"); return; }
    if (!addForm.title.trim()) { setAddError("Title is required"); return; }
    setAdding(true);
    try {
      const task = await api.tasks.create(addForm.projectId, {
        title: addForm.title.trim(),
        description: addForm.description.trim() || undefined,
        priority: addForm.priority,
        assignees: addAssigneeId ? [addAssigneeId] : [],
        dueAt: addDueAt || undefined,
      });
      const project = projects.find((p) => p._id === addForm.projectId);
      const taskWithProject: TaskWithProject = { ...task, projectName: project?.name ?? "Unknown" };
      setTasks((prev) => [taskWithProject, ...prev]);
      setAddForm({ projectId: "", title: "", description: "", priority: 3 });
      setAddAssigneeId("");
      setAddDueAt("");
      setShowAddTask(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setAdding(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  }

  // Only tasks where the logged-in user is an assignee
  const myTasks = user
    ? tasks.filter((t) => t.assignees.some((a) => a._id === user.id))
    : [];
  const filtered = statusFilter ? myTasks.filter((t) => t.status === statusFilter) : myTasks;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900">TaskFlow</span>
          </div>

          <nav className="flex items-center gap-4">
            <Link href="/" className="text-sm font-medium text-indigo-600">My Tasks</Link>
            <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Projects</Link>
            {user && (
              <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-700 hidden sm:block">{user.name}</span>
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Page title + actions */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading
                ? "Loading..."
                : `${filtered.length} task${filtered.length !== 1 ? "s" : ""} assigned to you${statusFilter ? ` · ${STATUS_LABELS[statusFilter]}` : ""}`}
            </p>
          </div>
          <button
            onClick={() => { setShowAddTask(true); setAddError(""); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Task
          </button>
        </div>

        {/* Status filter pills */}
        {!loading && myTasks.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-5">
            {["", "todo", "in_progress", "done", "archived"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-indigo-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                }`}
              >
                {s === "" ? "All" : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-gray-100 animate-pulse last:border-0">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-4 bg-gray-100 rounded w-24" />
                <div className="h-5 bg-gray-100 rounded-full w-20 ml-auto" />
                <div className="h-4 bg-gray-100 rounded w-16" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state — not assigned to any tasks */}
        {!loading && myTasks.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">No tasks assigned to you</h2>
            <p className="text-sm text-gray-500">Tasks assigned to you will appear here.</p>
          </div>
        )}

        {/* No results for current filter */}
        {!loading && myTasks.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">No tasks match this filter.</p>
          </div>
        )}

        {/* Task table */}
        {!loading && filtered.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[35%]">Task</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assignees</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Updated</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((task) => {
                  const priority = PRIORITY_LABELS[task.priority] ?? PRIORITY_LABELS[3];
                  return (
                    <tr
                      key={task._id}
                      className="hover:bg-indigo-50/40 transition-colors group"
                    >
                      {/* Task name */}
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/${task.projectId}`}
                          className="font-medium text-gray-900 group-hover:text-indigo-700 transition-colors line-clamp-1"
                        >
                          {task.title}
                        </Link>
                        {/* only title shown */}
                      </td>

                      {/* Project */}
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/${task.projectId}`}
                          className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full hover:bg-indigo-100 transition-colors whitespace-nowrap"
                        >
                          {task.projectName}
                        </Link>
                      </td>
 
                      {/* Assignees */}
                      <td className="px-4 py-3">
                        {task.assignees.length === 0 ? (
                          <span className="text-xs text-gray-400">N/A</span>
                        ) : (
                          <span className="text-sm text-gray-700">
                            {task.assignees.map((a) => a.name).join(", ")}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[task.status]}`}>
                          {STATUS_LABELS[task.status]}
                        </span>
                      </td>

                      {/* Priority */}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${priority.color}`}>{priority.label}</span>
                      </td>

                      {/* Due */}
                      <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                        {task.dueAt ? new Date(task.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                      </td>

                      {/* Updated */}
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(task.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </td>
 
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/${task.projectId}`}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700 transition-colors"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add Task Modal */}
      {showAddTask && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">New Task</h2>
              <button onClick={() => setShowAddTask(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddTask} className="p-6 space-y-4">
              {addError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{addError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project <span className="text-red-500">*</span>
                </label>
                {projects.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No projects found.{" "}
                    <Link href="/projects" className="text-indigo-600 hover:underline">Create one first.</Link>
                  </p>
                ) : (
                  <select
                    value={addForm.projectId}
                    onChange={(e) => setAddForm({ ...addForm, projectId: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">Select a project</option>
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Assignees */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assignees <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                {addForm.projectId ? (
                  projects.find((p) => p._id === addForm.projectId)?.members?.length === 0 ? (
                    <p className="text-sm text-gray-400">No project members found.</p>
                  ) : (
                    <select
                      value={addAssigneeId}
                      onChange={(e) => setAddAssigneeId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">Unassigned</option>
                      {projects
                        .find((p) => p._id === addForm.projectId)
                        ?.members?.map((m) => (
                          <option key={m._id} value={m._id}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  )
                ) : (
                  <p className="text-sm text-gray-400">Select a project to choose assignees.</p>
                )}
              </div>

              {/* Due date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
                <input
                  type="date"
                  value={addDueAt}
                  onChange={(e) => setAddDueAt(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={addForm.title}
                  onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                  placeholder="Task title"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  placeholder="Optional description..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={addForm.priority}
                  onChange={(e) => setAddForm({ ...addForm, priority: Number(e.target.value) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value={1}>Critical</option>
                  <option value={2}>High</option>
                  <option value={3}>Medium</option>
                  <option value={4}>Low</option>
                  <option value={5}>Minimal</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTask(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding || projects.length === 0}
                  className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {adding ? "Creating..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
