export interface RunnerOptions {
  /** Max concurrent executions for the in-process limiter. */
  concurrency?: number;
  /** When provided, plan the run's executions first: task × enabled candidate model. */
  taskIds?: string[];
  modelIds?: string[];
}

export interface RunSummary {
  evalRunId: string;
  executionsPlanned: number;
  succeeded: number;
  failed: number;
  /** Successful responses scored by the judge this run (fully or partially). */
  responsesJudged: number;
  /** Judged responses where some criteria failed validation — scores stored for the rest. */
  judgePartial: number;
  /** Responses whose judge call produced nothing storable (recorded, not fatal). */
  judgeFailed: number;
}
