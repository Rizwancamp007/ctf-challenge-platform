import { Server } from "socket.io";

// Pushes the live feed out over a socket: a client that connects gets
// the recent events at once, then every new event as it happens. The
// feed only ever carries public scoreboard facts — team names, challenge
// titles and points — never flags, emails or tokens, so the socket needs
// no login of its own.
export function attachLiveSocket(httpServer, live, { corsOrigin } = {}) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin || "http://localhost:5173" },
  });

  io.on("connection", (socket) => {
    socket.emit("feed", live.recent(50));
  });

  const unsubscribe = live.on("event", (event) => {
    io.emit("event", event);
  });

  return { io, close: unsubscribe };
}
