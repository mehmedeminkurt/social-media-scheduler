import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(workerDir, "../../frontend/.env") });

const { runWorkerLoop } = await import("./loop.js");

runWorkerLoop().catch((error) => {
  console.error("[worker] Fatal error:", error);
  process.exit(1);
});
