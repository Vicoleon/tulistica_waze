import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

interface ListUpdate {
  listId: number;
  action: "item_added" | "item_updated" | "item_checked" | "item_removed" | "list_updated";
  itemId?: number;
  userId: number;
  userName?: string;
  data?: any;
}

let io: Server | null = null;

export function initializeSocketServer(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/api/socket.io",
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Join a shopping list room
    socket.on("join_list", (listId: number) => {
      const room = `list_${listId}`;
      socket.join(room);
      console.log(`[Socket] ${socket.id} joined room ${room}`);
    });

    // Leave a shopping list room
    socket.on("leave_list", (listId: number) => {
      const room = `list_${listId}`;
      socket.leave(room);
      console.log(`[Socket] ${socket.id} left room ${room}`);
    });

    // Broadcast list updates to room members
    socket.on("list_update", (update: ListUpdate) => {
      const room = `list_${update.listId}`;
      // Broadcast to all clients in the room except sender
      socket.to(room).emit("list_update", update);
    });

    // Handle typing indicator
    socket.on("typing", (data: { listId: number; userId: number; userName: string }) => {
      const room = `list_${data.listId}`;
      socket.to(room).emit("user_typing", data);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getSocketServer(): Server | null {
  return io;
}

// Helper to emit list updates from server-side (e.g., from tRPC mutations)
export function emitListUpdate(update: ListUpdate) {
  if (!io) return;
  const room = `list_${update.listId}`;
  io.to(room).emit("list_update", update);
}

// Helper to emit to a specific user
export function emitToUser(userId: number, event: string, data: any) {
  if (!io) return;
  io.to(`user_${userId}`).emit(event, data);
}
