"use client";

import { useMemo, useState } from "react";
import { Task, Comment, api } from "@/lib/api-client";
import { CommentThread } from "./CommentThread";

interface TaskModalProps {
  task: Task;
  projectMembers: { _id: string; name: string; email: string }[];
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: (taskId: string) => void;
  newComment?: Comment;
}

const STATUSES: Task["status"][] = ["todo", "in_progress", "done", "archived"];

export function TaskModal({ task, projectMembers, onClose, onUpdate, onDelete, newComment }: TaskModalProps) {
  const [status, setStatus] = useState<Task["status"]>(task.status);
  const [saving, setSaving] = useState(false);
  const [priority, setPriority] = useState<number>(task.priority);
  const [deleting, setDeleting] = useState(false);
  const [assigneeActionId, setAssigneeActionId] = useState<string | null>(null);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");

  const availableAssignees = useMemo(() => {
    const assigned = new Set(task.assignees.map((a) => a._id));
    return [...projectMembers]
      .filter((m) => !assigned.has(m._id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projectMembers, task.assignees]);

  async function handleStatusChange(newStatus: Task["status"]) {
    setStatus(newStatus);
    setSaving(true);
    try {
      const updated = await api.tasks.update(task._id, { status: newStatus });
      onUpdate(updated);
    } catch (err) {
      console.error(err);
      setStatus(task.status);
    } finally {
      setSaving(false);
    }
  }

  async function handlePriorityChange(newPriority: number) {
    setPriority(newPriority);
    setSaving(true);
    try {
      const updated = await api.tasks.update(task._id, { priority: newPriority });
      onUpdate(updated);
      try {
        window.dispatchEvent(new CustomEvent("task:updated", { detail: updated }));
      } catch {}
    } catch (err) {
      console.error(err);
      setPriority(task.priority);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this task?")) return;
    setDeleting(true);
    try {
      await api.tasks.delete(task._id);
      onDelete(task._id);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }

  async function handleAssign(userId: string) {
    if (!userId) return;
    setAssigneeActionId(userId);
    try {
      const updated = await api.tasks.assign(task._id, userId);
      onUpdate(updated);
      setSelectedAssigneeId("");
    } catch (err) {
      console.error(err);
    } finally {
      setAssigneeActionId(null);
    }
  }

  async function handleUnassign(userId: string) {
    setAssigneeActionId(userId);
    try {
      const updated = await api.tasks.unassign(task._id, userId);
      onUpdate(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setAssigneeActionId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex-1 pr-4">
            <h2 className="text-lg font-semibold text-gray-900">{task.title}</h2>
            {task.description && (
              <p className="text-sm text-gray-500 mt-1">{task.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Status {saving && <span className="text-indigo-500 normal-case">saving...</span>}
            </label>
            <div className="flex gap-2 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    status === s
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => handlePriorityChange(Number(e.target.value))}
              className="px-3 py-1.5 text-gray-700 rounded-lg text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value={1}>Critical</option>
              <option value={2}>High</option>
              <option value={3}>Medium</option>
              <option value={4}>Low</option>
              <option value={5}>Minimal</option>
            </select>
          </div>

          {/* Assignees */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Assignees
            </label>

            {task.assignees.length === 0 ? (
              <p className="text-sm text-gray-400">No assignees yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-3">
                {task.assignees.map((a) => (
                  <span
                    key={a._id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm"
                  >
                    <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center">
                      {a.name.charAt(0).toUpperCase()}
                    </span>
                    <span>{a.name}</span>
                    <button
                      onClick={() => handleUnassign(a._id)}
                      disabled={assigneeActionId === a._id}
                      title="Unassign"
                      className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full text-indigo-700/70 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                    >
                      {assigneeActionId === a._id ? (
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
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <select
                value={selectedAssigneeId}
                onChange={(e) => setSelectedAssigneeId(e.target.value)}
                className="flex-1 px-3 py-2 text-gray-700 rounded-lg text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">
                  {availableAssignees.length === 0 ? "No available members to assign" : "Select member to assign"}
                </option>
                {availableAssignees.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleAssign(selectedAssigneeId)}
                disabled={!selectedAssigneeId || assigneeActionId !== null}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                Assign
              </button>
            </div>
          </div>

          {/* Meta info */}
          <div className="text-sm text-gray-600">
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide block mb-0.5">Created</span>
              {new Date(task.createdAt).toLocaleDateString()}
            </div>
          </div>

          {/* Comments */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Comments ({task.commentCount})
            </h3>
            <CommentThread taskId={task._id} newComment={newComment} />
          </div>

          {/* Delete */}
          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? "Deleting..." : "Delete task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
