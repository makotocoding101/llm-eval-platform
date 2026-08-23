// Minimal typed fetch client for the dashboard.
// Prod: point VITE_API_URL at the deployed API, including the /api prefix the
// routes are registered under (e.g. https://llm-eval-api.onrender.com/api).
// Dev: unset, so requests stay relative and the Vite proxy forwards them.
const BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

// Free-tier hosting spins the API down when idle, and while it boots the edge proxy
// answers on its behalf with 502/503. The first request of a visit therefore fails
// for a reason that resolves itself within about a minute. Retrying keeps the
// request pending instead of surfacing a red error, which lets the cold-start
// loading state (see useColdStart) explain the wait.
const RETRY_WINDOW_MS = 60_000;
const RETRY_INITIAL_MS = 500;
const RETRY_MAX_MS = 4_000;

/** Edge responses that mean the service was not reachable, so nothing ran. */
const NOT_YET_UP = new Set([502, 503]);
/** May mean the app received the request and timed out — only safe to repeat for reads. */
const GATEWAY_TIMEOUT = 504;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch, retrying for as long as the service still looks like it is booting.
 *
 * `idempotent` widens what counts as retryable. A read can be repeated whatever went
 * wrong, so it also retries gateway timeouts and outright network failures. A write
 * retries only when the status proves the request never reached the app: repeating
 * an ambiguous POST would start a second eval run and spend real provider credit.
 */
async function request(
  url: string,
  init: RequestInit | undefined,
  idempotent: boolean,
): Promise<Response> {
  const deadline = Date.now() + RETRY_WINDOW_MS;
  let delay = RETRY_INITIAL_MS;

  // Sleeps until the next attempt, or reports that the budget is spent. Never sleeps
  // past the deadline, so the total wait stays within the window.
  const waitForRetry = async (): Promise<boolean> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await sleep(Math.min(delay, remaining));
    delay = Math.min(delay * 2, RETRY_MAX_MS);
    return true;
  };

  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // Connection refused or a DNS blip while the service comes up.
      if (idempotent && (await waitForRetry())) continue;
      throw err;
    }

    const booting = NOT_YET_UP.has(res.status) || (idempotent && res.status === GATEWAY_TIMEOUT);
    // Budget spent: fall through and let the caller surface the real status.
    if (booting && (await waitForRetry())) continue;
    return res;
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await request(`${BASE}${path}`, undefined, true);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await request(
    `${BASE}${path}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    false,
  );
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export interface Provider {
  id: string;
  slug: string;
  displayName: string;
  enabled: boolean;
}

export interface Model {
  id: string;
  providerId: string;
  apiName: string;
  displayName: string;
  kind: "candidate" | "judge";
  enabled: boolean;
  /** At most one model holds this (DB-enforced); new runs are judged by it. */
  isActiveJudge: boolean;
}

export interface Criterion {
  id: string;
  name: string;
  description: string | null;
  weight: string;
  scaleMin: number;
  scaleMax: number;
}

export interface Rubric {
  id: string;
  name: string;
  criteria: Criterion[];
}

export interface Task {
  id: string;
  slug: string;
  prompt: string;
}

export interface Score {
  id: string;
  score: string;
  reasoning: string | null;
  criterion: Criterion;
}

export interface Quality {
  responseId: string;
  weightedScore: string | null;
  criteriaScored: number | null;
}

export interface ResponseRow {
  id: string;
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  scores: Score[];
  quality: Quality | null;
}

export interface Execution {
  id: string;
  status: "pending" | "running" | "success" | "error";
  errorMessage: string | null;
  model: Model;
  task: Task;
  response: ResponseRow | null;
}

export interface EvalRun {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface EvalRunDetail extends EvalRun {
  executions: Execution[];
}

export interface AgreementStats {
  n: number;
  /** Fraction of checks where human == judge (0..1). */
  exactRate: number;
  /** Fraction of checks where |judge - human| <= 1 (0..1). */
  within1Rate: number;
  meanAbsDiff: number;
  /** Mean of (judge - human): positive = judge more lenient than the human. */
  meanSignedDiff: number;
}

export interface CheckedRun {
  id: string;
  name: string;
  createdAt: string;
  checks: number;
}

export interface AgreementReport {
  /** Null when no spot checks match the filter. */
  overall: AgreementStats | null;
  byCriterion: Record<string, AgreementStats>;
  byJudgeModel: Record<string, AgreementStats>;
  lastCheckedAt: string | null;
  /** Runs that have at least one check, newest first. */
  runs: CheckedRun[];
  /** Run the report was computed over; null = all checks. */
  selectedRunId: string | null;
}

export interface CreateRunInput {
  name: string;
  rubricId: string;
  judgeModelId: string;
  taskIds: string[];
  modelIds: string[];
}

export const api = {
  models: () => get<Model[]>("/models"),
  tasks: () => get<Task[]>("/tasks"),
  rubrics: () => get<Rubric[]>("/rubrics"),
  evalRuns: () => get<EvalRun[]>("/eval-runs"),
  evalRun: (id: string) => get<EvalRunDetail>(`/eval-runs/${id}`),
  // Both return 202 immediately; the run executes in the background. Poll evalRun(id)
  // and watch `status`.
  createRun: (input: CreateRunInput) => post<{ evalRun: EvalRun }>("/eval-runs", input),
  rerun: (id: string) => post<{ evalRun: EvalRun }>(`/eval-runs/${id}/rerun`, {}),
  // No arg = the newest checked run (clean current-judge data); "all" = every check.
  spotCheckAgreement: (run?: string) =>
    get<AgreementReport>(`/spot-checks/agreement${run ? `?run=${encodeURIComponent(run)}` : ""}`),
};
