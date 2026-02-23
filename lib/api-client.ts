const BASE_URL = "";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? "Request failed");
  }
  return json.data as T;
}

export const api = {
  auth: {
    register: (body: { email: string; password: string; name: string }) =>
      apiFetch<{ token: string; user: { id: string; email: string; name: string } }>(
        "/api/auth/register",
        { method: "POST", body: JSON.stringify(body) }
      ),
    login: (body: { email: string; password: string }) =>
      apiFetch<{ token: string; user: { id: string; email: string; name: string } }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify(body) }
      ),
  },
  projects: {
    list: () => apiFetch<Project[]>("/api/projects"),
    create: (body: { name: string; description?: string }) =>
      apiFetch<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string) => apiFetch<Project>(`/api/projects/${id}`),
    update: (id: string, body: { name?: string; description?: string }) =>
      apiFetch<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiFetch<{ deleted: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
    addMember: (id: string, email: string) =>
      apiFetch<Project>(`/api/projects/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    removeMember: (id: string, userId: string) =>
      apiFetch<{ removed: boolean }>(`/api/projects/${id}/members?userId=${userId}`, {
        method: "DELETE",
      }),
    dashboard: (id: string, params?: { status?: string; assignee?: string; cursor?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.assignee) qs.set("assignee", params.assignee);
      if (params?.cursor) qs.set("cursor", params.cursor);
      if (params?.limit) qs.set("limit", String(params.limit));
      return apiFetch<{ tasks: Task[]; nextCursor: string | null; count: number }>(
        `/api/projects/${id}/dashboard?${qs}`
      );
    },
  },
  tasks: {
    create: (projectId: string, body: Partial<Task>) =>
      apiFetch<Task>(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    get: (id: string) => apiFetch<Task>(`/api/tasks/${id}`),
    update: (id: string, body: Partial<Task>) =>
      apiFetch<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiFetch<{ deleted: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
    assign: (id: string, userId: string) =>
      apiFetch<Task>(`/api/tasks/${id}/assign`, { method: "POST", body: JSON.stringify({ userId }) }),
    unassign: (id: string, userId: string) =>
      apiFetch<Task>(`/api/tasks/${id}/unassign`, { method: "POST", body: JSON.stringify({ userId }) }),
  },
  comments: {
    list: (taskId: string, cursor?: string) => {
      const qs = cursor ? `?cursor=${cursor}` : "";
      return apiFetch<{ comments: Comment[]; nextCursor: string | null }>(
        `/api/tasks/${taskId}/comments${qs}`
      );
    },
    create: (taskId: string, body: string) =>
      apiFetch<Comment>(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
  },
  search: (q: string, projectId?: string) => {
    const qs = new URLSearchParams({ q });
    if (projectId) qs.set("projectId", projectId);
    return apiFetch<{ tasks: Task[]; comments: Comment[]; query: string }>(`/api/search?${qs}`);
  },
};

// Lightweight local types for the client
export interface Project {
  _id: string;
  name: string;
  description?: string;
  owner: { _id: string; name: string; email: string };
  members: { _id: string; name: string; email: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  _id: string;
  projectId: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done" | "archived";
  assignees: { _id: string; name: string; email: string }[];
  priority: number;
  dueAt?: string;
  commentCount: number;
  lastCommentAt?: string;
  createdBy: { _id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  _id: string;
  taskId: string;
  authorId: { _id: string; name: string; email: string; avatarUrl?: string };
  body: string;
  createdAt: string;
  updatedAt: string;
}
