import { z } from "@hono/zod-openapi";

/** Curated member palette; the web maps each key to CSS variables (light + dark). */
export const MEMBER_COLORS = ["terracotta", "sage", "ochre", "plum", "slate", "rose"] as const;
export const memberColorSchema = z.enum(MEMBER_COLORS).openapi("MemberColor");

export const themeDefaultSchema = z.enum(["system", "light", "dark"]);

export const householdSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    timezone: z.string().describe("IANA timezone, e.g. Europe/Berlin. All display uses it."),
    weekStart: z.number().int().min(0).max(6).describe("0 = Sunday … 6 = Saturday."),
    themeDefault: themeDefaultSchema,
  })
  .openapi("Household");

export const updateHouseholdSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    timezone: z.string().trim().min(1).optional(),
    weekStart: z.number().int().min(0).max(6).optional(),
    themeDefault: themeDefaultSchema.optional(),
  })
  .openapi("UpdateHouseholdInput");

export const memberSchema = z
  .object({
    id: z.string(),
    householdId: z.string(),
    name: z.string(),
    colorToken: memberColorSchema,
    initial: z.string(),
    sort: z.number().int(),
  })
  .openapi("Member");

export const createMemberSchema = z
  .object({
    name: z.string().trim().min(1),
    colorToken: memberColorSchema,
    initial: z.string().trim().min(1).max(2).optional().describe("Defaults to the first letter of the name."),
  })
  .openapi("CreateMemberInput");

export const updateMemberSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    colorToken: memberColorSchema.optional(),
    initial: z.string().trim().min(1).max(2).optional(),
    sort: z.number().int().optional(),
  })
  .openapi("UpdateMemberInput");

export const memberIdParamSchema = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

export const memberListSchema = z.array(memberSchema).openapi("MemberList");

export const deleteResultSchema = z.object({ id: z.string() }).openapi("DeleteResult");
