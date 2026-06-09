import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

const app = express();
app.use(
  cors({
    origin: "http://localhost:5173",
  }),
);

const server = createServer(app);
const wss = new WebSocketServer({ server });

const parseClientMessage = (data: RawData): { type: string; content?: string } | null => {
  const text = typeof data === "string" ? data : data.toString();

  try {
    return JSON.parse(text) as { type: string; content?: string };
  } catch {
    return null;
  }
};

const sendJson = (ws: WebSocket, payload: unknown): void => {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
};

wss.on("connection", async (ws) => {
  const client = new CopilotClient();
  await client.start();

  ws.on("message", async (data) => {
    const message = parseClientMessage(data);

    if (!message || message.type !== "user_message" || typeof message.content !== "string") {
      sendJson(ws, { type: "error", content: "Invalid message payload" });
      return;
    }

    try {
      const session = await client.createSession({
        model: "gpt-5",
        onPermissionRequest: approveAll,
      });

      session.on("assistant.message_delta", (event) => {
        sendJson(ws, {
          type: "delta",
          content: event.data.deltaContent,
        });
      });

      session.on("session.idle", () => {
        sendJson(ws, { type: "done" });
      });

      await session.send({ prompt: message.content });
    } catch (error) {
      const content = error instanceof Error ? error.message : "Unknown error";
      sendJson(ws, { type: "error", content });
    }
  });

  ws.on("close", () => {
    void client.stop();
  });
});

server.listen(3001, () => {
  console.log("Server running on port 3001");
});
