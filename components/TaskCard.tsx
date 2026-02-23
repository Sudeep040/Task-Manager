"use client";

import { Task } from "@/lib/api-client";

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
}

const STATUS_COLORS: Record<Task["status"], string> = {
  todo: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  archived: "bg-yellow-100 text-yellow-700",
};

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Critical", color: "text-red-600" },
  2: { label: "High", color: "text-orange-500" },
  3: { label: "Medium", color: "text-yellow-600" },
  4: { label: "Low", color: "text-blue-500" },
  5: { label: "Minimal", color: "text-gray-400" },
};

export function TaskCard({ task, onClick }: TaskCardProps) {
  const priority = PRIORITY_LABELS[task.priority] ?? PRIORITY_LABELS[3];

  return (
    <div
      onClick={() => onClick(task)}
      className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-indigo-300 cursor-pointer transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-medium text-gray-900 text-sm leading-snug group-hover:text-indigo-700 line-clamp-2">
          {task.title}
        </h3>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STATUS_COLORS[task.status]}`}
        >
          {task.status.replace("_", " ")}
        </span>
      </div>

      {task.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-3">{task.description}</p>
      )}

      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2">
          {task.assignees.length > 0 && (
            <div className="flex -space-x-1">
              {task.assignees.slice(0, 3).map((a) => (
                <div
                  key={a._id}
                  title={a.name}
                  className="w-5 h-5 rounded-full bg-indigo-400 flex items-center justify-center text-white text-xs border border-white"
                >
                  {a.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}
          <span className={`text-xs font-medium ${priority.color}`}>{priority.label}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          {task.commentCount > 0 && (
            <span className="flex items-center gap-0.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {task.commentCount}
            </span>
          )}
          {task.dueAt && (
            <span>{new Date(task.dueAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
