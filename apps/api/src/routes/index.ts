import type { DB } from "@llm-eval/db";
import type { FastifyInstance } from "fastify";
import { evalRunRoutes } from "./evalRuns";
import { executionRoutes } from "./executions";
import { modelRoutes } from "./models";
import { providerRoutes } from "./providers";
import { rubricRoutes } from "./rubrics";
import { spotCheckRoutes } from "./spotChecks";
import { taskRoutes } from "./tasks";

export function registerRoutes(app: FastifyInstance, db: DB) {
  providerRoutes(app, db);
  modelRoutes(app, db);
  taskRoutes(app, db);
  rubricRoutes(app, db);
  evalRunRoutes(app, db);
  executionRoutes(app, db);
  spotCheckRoutes(app, db);
}
