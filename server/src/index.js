import buildApp from "./app.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { env } from "./config/env.js";

const start = async () => {
  await connectDB();

  const app = buildApp();
  const server = app.listen(env.port, () => {
    console.log(
      `[server] FitGen API listening on :${env.port} (${env.nodeEnv})`,
    );
    console.log(`[server] allowed origins → ${env.clientOrigins.join(", ")}`);
  });

  const shutdown = (signal) => async () => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Don't hang forever if a connection refuses to close.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", shutdown("SIGTERM"));
  process.on("SIGINT", shutdown("SIGINT"));
};

start().catch((err) => {
  console.error("[server] failed to start:", err.message);
  process.exit(1);
});
