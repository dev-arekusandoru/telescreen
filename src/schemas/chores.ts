import { z } from "@hono/zod-openapi";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const weekday = z.number().int().min(0).max(6).describe("0 = Sunday … 6 = Saturday");

/**
 * Recurrence descriptor. `start` is the schedule anchor (first eligible date, and for
 * "every N weeks" the week alignment); omitted on input = today in the household zone.
 */
const recurrenceVariants = <S extends z.ZodType>(start: S) => {
  return z.discriminatedUnion("type", [
    z.object({ type: z.literal("once"), date }),
    z.object({ type: z.literal("daily"), start }),
    z.object({ type: z.literal("weekdays"), days: z.array(weekday).min(1).max(7), start }),
    z.object({
      type: z.literal("weekly"),
      every: z.number().int().min(1).max(52).describe("1 = every week, N = every N weeks."),
      weekday,
      start,
    }),
    z.object({
      type: z.literal("monthly"),
      day: z.number().int().min(1).max(31).describe("Day of month; clamped to the month's last day."),
      start,
    }),
  ]);
};

export const recurrenceSchema = recurrenceVariants(date).openapi("ChoreRecurrence");
export const recurrenceInputSchema = recurrenceVariants(date.optional()).openapi("ChoreRecurrenceInput");

export const assignmentSchema = z.enum(["fixed", "rotating", "either"]).openapi("ChoreAssignment");
export const occurrenceStatusSchema = z.enum(["open", "done", "missed", "skipped"]).openapi("ChoreOccurrenceStatus");

const dueTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

export const choreSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    icon: z.string().nullable(),
    notes: z.string().nullable(),
    recurrence: recurrenceSchema,
    assignment: assignmentSchema,
    memberIds: z.array(z.string()).describe("Ordered: the rotation order for `rotating`; the assignee for `fixed`."),
    dueTime: dueTime.nullable(),
    estimatedMinutes: z.number().int().nullable(),
    archived: z.boolean(),
  })
  .openapi("Chore");

export const choreListSchema = z.array(choreSchema).openapi("ChoreList");

export const createChoreSchema = z
  .object({
    name: z.string().trim().min(1),
    icon: z.string().trim().max(16).nullable().optional(),
    notes: z.string().nullable().optional(),
    recurrence: recurrenceInputSchema,
    assignment: assignmentSchema,
    memberIds: z.array(z.string()).max(12).default([]),
    dueTime: dueTime.nullable().optional(),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  })
  .openapi("CreateChoreInput");

export const updateChoreSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    icon: z.string().trim().max(16).nullable().optional(),
    notes: z.string().nullable().optional(),
    recurrence: recurrenceInputSchema.optional(),
    assignment: assignmentSchema.optional(),
    memberIds: z.array(z.string()).max(12).optional(),
    dueTime: dueTime.nullable().optional(),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .openapi("UpdateChoreInput");

export const choreIdParamSchema = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

export const occurrenceSchema = z
  .object({
    id: z.string(),
    choreId: z.string(),
    indexN: z.number().int(),
    dueDate: date,
    status: occurrenceStatusSchema,
    assigneeId: z.string().nullable().describe("Null for `either` chores until reassigned."),
    completedBy: z.string().nullable(),
    completedAt: z.string().nullable(),
    name: z.string(),
    icon: z.string().nullable(),
    notes: z.string().nullable(),
    dueTime: z.string().nullable(),
    estimatedMinutes: z.number().int().nullable(),
    assignment: assignmentSchema,
    nextAssigneeId: z.string().nullable().describe("Rotating chores: who gets the following occurrence."),
  })
  .openapi("ChoreOccurrence");

export const occurrenceListSchema = z.array(occurrenceSchema).openapi("ChoreOccurrenceList");

export const occurrenceQuerySchema = z.object({
  from: date.openapi({ param: { name: "from", in: "query" } }),
  to: date.openapi({ param: { name: "to", in: "query" } }),
  member: z.string().optional().openapi({ param: { name: "member", in: "query" } }),
  carryover: z
    .enum(["true", "false"])
    .optional()
    .describe("Also return still-live open occurrences due before `from` (for Today).")
    .openapi({ param: { name: "carryover", in: "query" } }),
});

export const occurrenceIdParamSchema = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

export const completeOccurrenceSchema = z.object({ completedBy: z.string() }).openapi("CompleteOccurrenceInput");
export const reassignOccurrenceSchema = z.object({ memberId: z.string() }).openapi("ReassignOccurrenceInput");

export const progressQuerySchema = z.object({
  date: date.openapi({ param: { name: "date", in: "query" } }),
});

export const progressSchema = z
  .array(z.object({ memberId: z.string(), done: z.number().int(), total: z.number().int() }))
  .openapi("ChoreProgress");

export type Recurrence = z.infer<typeof recurrenceSchema>;
export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
