# TaskFlow — Real-Time Collaborative Task Manager

A full-stack collaborative task management application built with Next.js, MongoDB, Socket.io, and JWT authentication. Multiple users can manage projects and tasks simultaneously with live updates and presence detection.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1 (App Router, TypeScript) |
| Database | MongoDB via Mongoose 9 |
| Real-Time | Socket.io 4 (WebSockets) |
| Auth | JSON Web Tokens — `jsonwebtoken` (Node) + `jose` (Edge) |
| Validation | Zod 4 |
| Styling | Tailwind CSS v4 |
| Testing | Jest 29 + ts-jest |
| Cache / Scale | Upstash Redis (optional Socket.io adapter) |

---

## Features

- **Auth** — Register/login with JWT; protected API routes via Next.js Edge middleware
- **Projects** — Create, update, delete; add/remove collaborators by email
- **Tasks** — Full CRUD; status board (Todo / In Progress / Done / Archived); assign/unassign users; priority (1–5); due dates
- **Comments** — Thread comments on tasks with cursor-based pagination
- **Real-Time** — Live task create/update/delete events broadcast to all project members via Socket.io rooms
- **Presence** — See which users are currently viewing a project dashboard
- **Search** — Full-text search across task titles, descriptions, and comments using MongoDB text indexes
- **Pagination** — Cursor-based pagination for tasks and comments (stable under concurrent writes)

---

## Project Structure

```
task-manager/
├── app/
│   ├── (auth)/login/          # Login page
│   ├── (auth)/register/       # Register page
│   ├── dashboard/[projectId]/ # Project kanban dashboard
│   ├── profile/               # User profile & password change
│   ├── projects/              # Projects listing
│   └── api/                   # REST API routes
│       ├── auth/              #   register, login
│       ├── profile/           #   get/update profile, change password
│       ├── projects/          #   CRUD + members + dashboard query
│       ├── tasks/             #   CRUD + assign/unassign + comments
│       └── search/            #   full-text search
├── components/                # React UI components
├── hooks/useSocket.ts         # Client-side Socket.io hook
├── lib/
│   ├── api-helpers.ts         # ApiError, withAuth, cursor helpers
│   ├── api-client.ts          # Typed fetch wrapper (adds Bearer header)
│   ├── auth/jwt.ts            # JWT sign/verify helpers
│   ├── db/                    # Mongoose connection + models
│   ├── pagination.ts          # Cursor pagination business logic
│   ├── socket/                # Socket.io server, emitter, event names
│   ├── taskService.ts         # Task status transition rules
│   └── validation/            # Zod request schemas
├── tests/                     # Jest unit tests
├── middleware.ts              # JWT route guard (Edge runtime)
└── server.ts                  # Custom HTTP server (boots Socket.io)
```

---

## Setup Instructions

### Prerequisites

- Node.js 18+
- A free [MongoDB Atlas](https://mongodb.com/atlas) cluster (or a local MongoDB instance)
- A free [Upstash Redis](https://upstash.com) database — **optional**, only required when running multiple server instances

### 1. Clone and install

```bash
git clone <your-repo-url>
cd task-manager
npm install
```

### 2. Create the environment file

Create a `.env.local` file in the project root with the following contents:

```env
# MongoDB connection string (required)
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/taskmanager?retryWrites=true&w=majority

# JWT configuration (required)
JWT_SECRET=your-super-secret-jwt-key-at-least-32-chars
JWT_EXPIRES_IN=7d

# Socket.io client URL — must match the port the server runs on (required)
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000

# Upstash Redis — only needed for multi-instance horizontal scaling (optional)
UPSTASH_REDIS_REST_URL=https://<your-upstash-endpoint>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<your-upstash-rest-token>
REDIS_URL=rediss://default:<password>@<host>:6379
```

> If `REDIS_URL` / `UPSTASH_REDIS_REST_URL` are absent, the server automatically falls back to an **in-memory Socket.io adapter** — perfectly fine for local development on a single process.

### Environment variable reference

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB Atlas (or local) connection string |
| `JWT_SECRET` | Yes | Secret key used to sign and verify JWTs — keep this long and random in production |
| `JWT_EXPIRES_IN` | Yes | Token lifetime, e.g. `7d`, `24h` |
| `NEXT_PUBLIC_SOCKET_URL` | Yes | Full URL of the server; used by the browser to connect Socket.io |
| `UPSTASH_REDIS_REST_URL` | No | Upstash REST endpoint for the Redis adapter |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash REST token |
| `REDIS_URL` | No | `rediss://` connection string used by the Socket.io Redis adapter |

### 3. Get MongoDB Atlas credentials

1. Go to [mongodb.com/atlas](https://mongodb.com/atlas) and create a free cluster
2. Under **Database Access**, create a user with a password
3. Under **Network Access**, add your IP (or `0.0.0.0/0` for dev)
4. Click **Connect → Drivers** and copy the connection string
5. Replace `<password>` in the URI with your actual password

### 4. Get Upstash Redis credentials (optional)

1. Go to [upstash.com](https://upstash.com) and create a free Redis database
2. On the database detail page, copy:
   - **REST URL** → `UPSTASH_REDIS_REST_URL`
   - **REST Token** → `UPSTASH_REDIS_REST_TOKEN`
   - **Redis URL** (the `rediss://` one) → `REDIS_URL`

### 5. Run development server

```bash
npm run dev
```

The app starts on **http://localhost:3000**.

> `npm run dev` launches the custom `server.ts` via `tsx` (not `next dev` directly), which boots Socket.io alongside Next.js on the same port.

### 6. Build for production

```bash
npm run build
npm start
```

### 7. Run tests

```bash
npm test
# or in watch mode
npm run test:watch
```

---

## API Endpoints

All endpoints except `register` and `login` require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register — returns JWT |
| POST | `/api/auth/login` | Login — returns JWT |

### Projects

| Method | Path | Description |
|---|---|---|
| GET | `/api/projects` | List projects the user owns or belongs to |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project |
| PATCH | `/api/projects/:id` | Update name/description (owner only) |
| DELETE | `/api/projects/:id` | Delete project (owner only) |
| POST | `/api/projects/:id/members` | Add member by email (owner only) |
| DELETE | `/api/projects/:id/members?userId=` | Remove member (owner only) |
| GET | `/api/projects/:id/dashboard` | Paginated task list with optional filters |

Dashboard query params: `status`, `assignee`, `cursor`, `limit`

### Tasks

| Method | Path | Description |
|---|---|---|
| POST | `/api/projects/:projectId/tasks` | Create task |
| GET | `/api/tasks/:id` | Get task |
| PATCH | `/api/tasks/:id` | Update task (creator or assignee) |
| DELETE | `/api/tasks/:id` | Delete task (creator only) |
| POST | `/api/tasks/:id/assign` | Assign user `{ userId }` (creator only) |
| POST | `/api/tasks/:id/unassign` | Unassign user `{ userId }` (creator only) |

### Comments

| Method | Path | Description |
|---|---|---|
| GET | `/api/tasks/:id/comments` | List comments (cursor paginated) |
| POST | `/api/tasks/:id/comments` | Add comment `{ body }` |

### Profile

| Method | Path | Description |
|---|---|---|
| GET | `/api/profile` | Get current user |
| PATCH | `/api/profile` | Update name / avatar URL |
| POST | `/api/profile/password` | Change password |

### Search

| Method | Path | Description |
|---|---|---|
| GET | `/api/search?q=&projectId=` | Full-text search across tasks and comments |

---

## Real-Time Events (Socket.io)

Connect with your JWT token:

```js
const socket = io("http://localhost:3000", {
  auth: { token: "your-jwt-token" }
});

// Join a project room to receive events for that project
socket.emit("project:join", projectId);

// Task events
socket.on("task:created", (task) => { ... });
socket.on("task:updated", (task) => { ... });
socket.on("task:deleted", ({ taskId }) => { ... });

// Comment events
socket.on("comment:created", ({ taskId, comment }) => { ... });

// Presence events — fired whenever someone joins or leaves
socket.on("presence:update", ({ projectId, users }) => { ... });

// Leave cleanly before disconnect
socket.emit("project:leave", projectId);
```

---

## Design Decisions

### 1. Custom HTTP server instead of Next.js built-in

Socket.io needs access to the raw `http.Server` instance to attach its WebSocket upgrade handler. Next.js does not expose this. The solution is a thin `server.ts` that:

1. Starts Next.js programmatically with `app.prepare()`
2. Wraps it in a standard `http.createServer`
3. Attaches Socket.io to that server
4. Listens on a single port (3000) for both HTTP and WebSocket traffic

**Tradeoff:** The app can no longer be deployed directly to Vercel or other serverless platforms without separating the Socket.io server into a dedicated service. For production scale, the real-time layer would be extracted; for a self-hosted or containerised deployment this is zero additional cost.

### 2. Two JWT libraries — `jsonwebtoken` and `jose`

Both libraries are present intentionally:

- **`jsonwebtoken`** — uses Node.js crypto (`crypto.createHmac`). Used in API route handlers which run in the full Node.js runtime.
- **`jose`** — uses the Web Crypto API (`SubtleCrypto`). Used in `middleware.ts` which runs on the Next.js **Edge runtime** where Node.js built-ins are not available.

Attempting to use `jsonwebtoken` in middleware produces a "module not found" error at the edge. `jose` is the correct choice there.

### 3. Cursor-based pagination instead of offset

The dashboard and comment endpoints use a compound `(updatedAt, _id)` cursor rather than `SKIP / OFFSET`.

**Why:**
- **Stability** — In a real-time collaborative environment tasks are continuously updated, causing offset pages to skip or duplicate items as the result set shifts between page loads.
- **Performance** — The cursor maps directly to a compound index (`projectId, updatedAt, _id`), so MongoDB resolves the query with a range scan and no `skip` cost.
- **Scalability** — Performance is constant regardless of dataset size; `SKIP N` degrades linearly.

**Tradeoff:** Cannot jump to an arbitrary page number or display "Page 3 of 10". Acceptable for an infinitely-scrolling task board.

### 4. Referenced comments collection instead of embedded array

Comments live in their own `comments` collection with a `taskId` foreign key, rather than being embedded in the task document.

**Why:**
- Dashboard queries fetch many tasks at once; embedding all comments would bloat those reads significantly.
- Comments can carry their own full-text index (`body: "text"`) independent of the task index.
- Cursor-based pagination over comments is straightforward with a standalone collection.
- `commentCount` and `lastCommentAt` are denormalised on the Task document to avoid an extra round-trip for the most common display case.

**Tradeoff:** Loading a task with its full comment thread requires two queries. The denormalised fields mitigate this for the common case (showing count in card view); the full thread is only fetched when a user opens the task modal.

### 5. In-memory presence with optional Redis fallback

Online user presence (who is viewing a project right now) is tracked in a server-side `Map<projectId, Map<userId, PresenceEntry>>`.

- With **no Redis**: works perfectly for a single server process (local dev, small self-hosted deployments).
- With **Redis (`REDIS_URL`)**: the Socket.io Redis adapter synchronises room membership and events across multiple server instances, making presence consistent under horizontal scaling.

The server checks for `REDIS_URL` at startup and silently falls back to the in-memory adapter if it is absent or the connection fails, so the app starts without any configuration for local use.

### 6. Mongoose connection caching via `globalThis`

`lib/db/connect.ts` stores the Mongoose connection on `global.mongooseCache`. This pattern survives Next.js hot-module reloads in development — without it each file change would open a new MongoDB connection and quickly exhaust the Atlas connection pool.

---

## MongoDB Indexes

Indexes created automatically via Mongoose schema definitions:

```
Task: { projectId: 1, status: 1, updatedAt: -1, _id: -1 }    — status-filtered dashboard
Task: { projectId: 1, assignees: 1, updatedAt: -1, _id: -1 }  — assignee-filtered dashboard
Task: { projectId: 1, updatedAt: -1, _id: -1 }                — unfiltered dashboard
Task: { projectId: 1, title: "text", description: "text" }    — full-text task search
Comment: { taskId: 1, createdAt: -1, _id: -1 }                — comment thread pagination
Comment: { taskId: 1, body: "text" }                          — full-text comment search
Project: { owner: 1, updatedAt: -1 }                          — projects list by owner
Project: { members: 1, updatedAt: -1 }                        — projects list by membership
```

---

## Running the Real-Time Demo (Two-Window Test)

1. Start the server: `npm run dev`
2. Open **http://localhost:3000** in two separate browser windows (or profiles)
3. Register two different accounts — one in each window
4. In Window A: create a project
5. In Window A: add Window B's email as a project member
6. In Window B: log in and open the same project dashboard
7. Both windows now show each other in the **Online** presence bar
8. In Window A: create or update a task — it appears instantly in Window B
9. In Window A: post a comment — it appears in Window B's task modal in real time
