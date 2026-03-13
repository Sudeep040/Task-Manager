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
  users: {
    list: (params?: { q?: string; projectId?: string }) => {
      const qs = new URLSearchParams();
      if (params?.q) qs.set("q", params.q);
      if (params?.projectId) qs.set("projectId", params.projectId);
      return apiFetch<UserShort[]>(`/api/users?${qs}`);
    },
  },
  tasks: {
    list: () => apiFetch<{ tasks: TaskWithProject[] }>("/api/tasks"),
    create: (projectId: string, body: CreateTaskBody) =>
      apiFetch<Task>(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    get: (id: string) => apiFetch<Task>(`/api/tasks/${id}`),
    update: (id: string, body: UpdateTaskBody) =>
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
  profile: {
    get: () => apiFetch<UserProfile>("/api/profile"),
    update: (body: { name?: string; avatarUrl?: string }) =>
      apiFetch<UserProfile>("/api/profile", { method: "PATCH", body: JSON.stringify(body) }),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      apiFetch<{ message: string }>("/api/profile/password", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
};

// Upload API — works with XHR so callers can track upload progress
export const uploadApi = {
  /**
   * Get presigned URL(s) for uploading a file to S3.
   * Returns either a single URL (< 20 MB) or multipart info (>= 20 MB).
   */
  initUpload: async (params: {
    filename: string;
    contentType: string;
    fileSize: number;
  }): Promise<UploadInitResponse> => {
    const token = getToken();
    const res = await fetch("/api/upload/init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? "Upload init failed");
    return json.data as UploadInitResponse;
  },

  /**
   * Complete a multipart S3 upload after all parts have been sent.
   */
  completeMultipart: async (params: {
    key: string;
    uploadId: string;
    parts: { PartNumber: number; ETag: string }[];
  }): Promise<{ publicUrl: string; key: string }> => {
    const token = getToken();
    const res = await fetch("/api/upload/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? "Upload complete failed");
    return json.data as { publicUrl: string; key: string };
  },

  /**
   * Upload a chunk (single or multipart part) via XHR so we get progress events.
   * Returns the ETag header value from the S3 response (needed for multipart completion).
   */
  uploadChunk: (
    url: string,
    data: Blob,
    onProgress?: (percent: number) => void
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      // S3 presigned PUTs must NOT have Authorization header
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.getResponseHeader("ETag") ?? "");
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });
      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
      xhr.send(data);
    });
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

export interface Attachment {
  url: string;
  key: string;
  filename: string;
  fileType: "image" | "video";
  fileSize: number;
}

export type UploadInitResponse =
  | {
      type: "single";
      uploadUrl: string;
      key: string;
      publicUrl: string;
      fileType: "image" | "video";
      filename: string;
      fileSize: number;
    }
  | {
      type: "multipart";
      uploadId: string;
      key: string;
      parts: { partNumber: number; uploadUrl: string; start: number; end: number }[];
      publicUrl: string;
      fileType: "image" | "video";
      filename: string;
      fileSize: number;
    };

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
  attachments: Attachment[];
  createdBy: { _id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface TaskWithProject extends Task {
  projectName: string;
}

export interface CreateTaskBody {
  title: string;
  description?: string;
  status?: Task["status"];
  assignees?: string[];
  priority?: number;
  dueAt?: string;
  attachments?: Attachment[];
}

export interface UpdateTaskBody {
  title?: string;
  description?: string;
  status?: Task["status"];
  assignees?: string[];
  priority?: number;
  dueAt?: string;
}

export interface Comment {
  _id: string;
  taskId: string;
  authorId: { _id: string; name: string; email: string; avatarUrl?: string };
  body: string;
  createdAt: string;
  updatedAt: string;
}

// Short user shape used by client
export interface UserShort {
  _id: string;
  name: string;
  email: string;
}

export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  lastActiveAt?: string;
  createdAt: string;
  updatedAt: string;
}
