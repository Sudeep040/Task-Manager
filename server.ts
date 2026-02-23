import 'dotenv/config';
import { createServer } from "http";
import next from "next";
import { initSocketServer } from "./lib/socket/server";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  initSocketServer(httpServer)
    .then(() => {
      console.log("[Server] Socket.io initialized");
    })
    .catch((err) => {
      console.error("[Server] Failed to initialize Socket.io:", err);
    });

  httpServer.listen(port, () => {
    console.log(`[Server] Ready on http://localhost:${port}`);
  });
});
