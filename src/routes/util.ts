import type { ZodType } from "zod";

/** `content` block for a JSON request/response schema. */
export const json = <T extends ZodType>(schema: T) => ({ "application/json": { schema } });
