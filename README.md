# TaskFlow — Real-Time Collaborative Task Manager

A full-stack collaborative task management application built with Next.js, MongoDB, Socket.io, and JWT authentication. Multiple users can manage projects and tasks simultaneously with live updates and presence detection.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | MongoDB via Mongoose |
| Real-Time | Socket.io (WebSockets) |
| Auth | JSON Web Tokens (JWT) |
| Validation | Zod |
| Styling | Tailwind CSS |
| Testing | Jest + ts-jest |
| Redis (optional) | Upstash Redis (Socket.io adapter) |

---

## Features

- **Auth** — Register/login with JWT; protected API routes via Next.js middleware
- **Projects** — Create, update, delete; add/remove collaborators by email
- **Tasks** — Full CRUD; status board (Todo / In Progress / Done / Archived); assign/unassign users; priority; due dates
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
│   ├── (auth)/login/        # Login page
│   ├── (auth)/register/     # Register page
│   ├── dashboard/[projectId]/ # Project dashboard
│   └── api/                 # REST API routes
│       ├── auth/
│       ├── projects/
│       ├── tasks/
│       └── search/
├── components/              # React UI components
├── hooks/useSocket.ts       # Client-side Socket.io hook
├── lib/
│   ├── api-helpers.ts       # Error classes, response helpers, cursor utils
│   ├── api-client.ts        # Typed fetch client for frontend
│   ├── auth/jwt.ts          # JWT sign/verify helpers
│   ├── db/                  # Mongoose connection + models
│   ├── pagination.ts        # Cursor pagination business logic
│   ├── socket/              # Socket.io server, emitter, events
│   ├── taskService.ts       # Task status transition rules
│   └── validation/          # Zod schemas
├── tests/                   # Jest unit tests
├── middleware.ts            # JWT route guard
└── server.ts               # Custom HTTP server (boots Socket.io)
```

---

## Setup Instructions

### Prerequisites

- Node.js 18+
- A free [MongoDB Atlas](https://mongodb.com/atlas) cluster
- A free [Upstash Redis](https://upstash.com) database (optional, required for multi-node Socket.io)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd task-manager
npm install
```

### 2. Configure environment variables

Copy the template and fill in your values:

```bash
cp .env.local .env.local
```

Edit `.env.local`:

```env
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/taskmanager?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
UPSTASH_REDIS_REST_URL=https://<your-upstash-endpoint>.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-token
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

> If `UPSTASH_REDIS_REST_URL` is not set (or left as the placeholder), the server will automatically fall back to an in-memory Socket.io adapter — suitable for local development with a single process.

### 3. Get MongoDB Atlas URI

1. Go to [mongodb.com/atlas](https://mongodb.com/atlas) and create a free cluster
2. Under **Database Access**, create a user with password
3. Under **Network Access**, allow your IP (or 0.0.0.0/0 for dev)
4. Click **Connect → Connect your application** and copy the connection string

### 4. Get Upstash Redis credentials (optional)

1. Go to [upstash.com](https://upstash.com) and create a free Redis database
2. From the database detail page, copy **REST URL** and **REST Token**
3. Paste them into `.env.local`

### 5. Run development server

```bash
npm run dev
```

The app starts on **http://localhost:3000**.

### 6. Build for production

```bash
npm run build
npm start
```

### 7. Run tests

```bash
npm test
```

---

## API Endpoints

All endpoints (except auth) require `Authorization: Bearer <token>` header.

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register (returns JWT) |
| POST | `/api/auth/login` | Login (returns JWT) |

### Projects
| Method | Path | Description |
|---|---|---|
| GET | `/api/projects` | List user's projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project |
| PATCH | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/projects/:id/members` | Add member by email |
| DELETE | `/api/projects/:id/members?userId=` | Remove member |
| GET | `/api/projects/:id/dashboard` | Tasks with filter+pagination |

Dashboard query params: `status`, `assignee`, `cursor`, `limit`

### Tasks
| Method | Path | Description |
|---|---|---|
| POST | `/api/projects/:projectId/tasks` | Create task |
| GET | `/api/tasks/:id` | Get task |
| PATCH | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/tasks/:id/assign` | Assign user `{ userId }` |
| POST | `/api/tasks/:id/unassign` | Unassign user `{ userId }` |

### Comments
| Method | Path | Description |
|---|---|---|
| GET | `/api/tasks/:id/comments` | List comments (cursor paginated) |
| POST | `/api/tasks/:id/comments` | Add comment `{ body }` |

### Search
| Method | Path | Description |
|---|---|---|
| GET | `/api/search?q=&projectId=` | Full-text search tasks + comments |

---

## Real-Time Events (Socket.io)

Connect with your JWT token:

```js
const socket = io("http://localhost:3000", {
  auth: { token: "your-jwt-token" }
});

// Join a project room
socket.emit("project:join", projectId);

// Listen for task changes
socket.on("task:created", (task) => { ... });
socket.on("task:updated", (task) => { ... });
socket.on("task:deleted", ({ taskId }) => { ... });
socket.on("comment:created", ({ taskId, comment }) => { ... });

// Presence
socket.on("presence:update", ({ projectId, users }) => { ... });
```

---

## Design Decisions & Tradeoffs

### 1. Referenced Comments vs Embedded

Comments are stored in a separate `comments` collection rather than embedded in task documents.

**Why referenced:**
- Tasks with many comments would grow large, slowing down dashboard queries that only need task metadata
- Comments can be independently indexed for full-text search
- Cursor-paginated fetching of comments is straightforward
- Simpler atomic increments of `commentCount` on Task

**Tradeoff:** Fetching a task with its full comment thread requires two queries instead of one. Mitigated by keeping `commentCount` and `lastCommentAt` denormalized on the Task document.

### 2. Cursor-based Pagination vs Offset

Cursor-based pagination using `(updatedAt, _id)` as a compound cursor.

**Why cursor-based:**
- **Stability:** Offset pagination skips/duplicates rows when tasks are inserted or updated between page loads — common in a real-time collaborative environment
- **Performance:** Uses a covered compound index `(projectId, updatedAt, _id)` — no skip cost
- **Scalability:** Does not degrade as dataset grows (unlike `SKIP N`)

**Tradeoff:** Cannot jump to an arbitrary page number or show "Page 3 of 10". For a task dashboard this is fine — users scroll or load more.

### 3. In-Memory vs Redis Presence

Presence is stored in a server-side `Map`. With Upstash Redis, the Socket.io adapter is attached which enables multi-process coordination.

**Why this approach:**
- Single-node dev works with zero config (no Redis needed)
- Upstash REST API is compatible with Next.js serverless/edge constraints
- Graceful degradation: if Redis credentials are absent, falls back to in-memory

**Tradeoff:** If running multiple server instances without Redis, presence maps are not synchronized across nodes. Redis resolves this.

### 4. Custom HTTP Server vs Next.js API Routes for Socket.io

Socket.io requires a persistent HTTP server. Next.js API routes are stateless and can't maintain WebSocket connections.

**Solution:** A custom `server.ts` that wraps Next.js's request handler and co-hosts Socket.io on the same port (3000).

**Tradeoff:** Loses some Vercel/serverless deployment compatibility. For production scale, Socket.io server would be extracted to a dedicated service.

---

## MongoDB Indexes

Key indexes created automatically by Mongoose schema definitions:

```
Task: { projectId: 1, status: 1, updatedAt: -1 }     — filtered dashboard
Task: { projectId: 1, assignees: 1, updatedAt: -1 }   — assignee filter
Task: { title: "text", description: "text" }           — full-text search
Comment: { taskId: 1, createdAt: -1 }                 — thread fetch
Comment: { body: "text" }                              — full-text search
```

---

## Running the Demo (Two-Window Real-Time Test)

1. Start the server: `npm run dev`
2. Open **http://localhost:3000** in two browser windows
3. Register two different accounts (Window A, Window B)
4. In Window A: create a project
5. In Window A: add Window B's user as a member (by email)
6. In Window B: log in and open the same project dashboard
7. Both windows now show each other in the **Online** presence bar
8. In Window A: create or update a task — it appears instantly in Window B
9. In Window A: add a comment — it appears in Window B's task modal in real time
