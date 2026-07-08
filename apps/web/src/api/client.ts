// Minimal typed fetch client for the dashboard.
const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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
};
