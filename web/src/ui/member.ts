import type { CSSProperties } from "react";

/** Inline style that sets `--c` to a member's palette color (`null`/unknown = Family neutral). */
export function memberColorStyle(colorToken: string | null | undefined): CSSProperties {
  return { "--c": `var(--member-${colorToken ?? "family"})` } as CSSProperties;
}
