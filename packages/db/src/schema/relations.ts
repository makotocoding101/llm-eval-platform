import { relations } from "drizzle-orm";
import { evalRuns } from "./evalRuns";
import { executions } from "./executions";
import { models } from "./models";
import { providers } from "./providers";
import { responses } from "./responses";
import { rubricCriteria } from "./rubricCriteria";
import { rubrics } from "./rubrics";
import { scores } from "./scores";
import { spotChecks } from "./spotChecks";
import { tasks } from "./tasks";

export const providersRelations = relations(providers, ({ many }) => ({
  models: many(models),
}));

export const modelsRelations = relations(models, ({ one }) => ({
  provider: one(providers, { fields: [models.providerId], references: [providers.id] }),
}));

export const rubricsRelations = relations(rubrics, ({ many }) => ({
  criteria: many(rubricCriteria),
  evalRuns: many(evalRuns),
}));

export const rubricCriteriaRelations = relations(rubricCriteria, ({ one, many }) => ({
  rubric: one(rubrics, { fields: [rubricCriteria.rubricId], references: [rubrics.id] }),
  scores: many(scores),
}));

export const tasksRelations = relations(tasks, ({ many }) => ({
  executions: many(executions),
}));

export const evalRunsRelations = relations(evalRuns, ({ one, many }) => ({
  rubric: one(rubrics, { fields: [evalRuns.rubricId], references: [rubrics.id] }),
  judgeModel: one(models, { fields: [evalRuns.judgeModelId], references: [models.id] }),
  executions: many(executions),
}));

export const executionsRelations = relations(executions, ({ one }) => ({
  evalRun: one(evalRuns, { fields: [executions.evalRunId], references: [evalRuns.id] }),
  task: one(tasks, { fields: [executions.taskId], references: [tasks.id] }),
  model: one(models, { fields: [executions.modelId], references: [models.id] }),
  response: one(responses),
}));

export const responsesRelations = relations(responses, ({ one, many }) => ({
  execution: one(executions, { fields: [responses.executionId], references: [executions.id] }),
  scores: many(scores),
}));

export const scoresRelations = relations(scores, ({ one, many }) => ({
  response: one(responses, { fields: [scores.responseId], references: [responses.id] }),
  criterion: one(rubricCriteria, {
    fields: [scores.rubricCriterionId],
    references: [rubricCriteria.id],
  }),
  judgeModel: one(models, { fields: [scores.judgeModelId], references: [models.id] }),
  spotChecks: many(spotChecks),
}));

export const spotChecksRelations = relations(spotChecks, ({ one }) => ({
  score: one(scores, { fields: [spotChecks.scoreId], references: [scores.id] }),
}));
