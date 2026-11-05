import { ForkKnife } from "@phosphor-icons/react";
import { useMeals, type MealItem } from "@/features/meals";
import styles from "./Meals.module.css";

const SLOT_LABEL: Record<MealItem["slot"], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
};

/**
 * "Tonight" body for the right column and the small-screen widgets popup (SPEC §8).
 * Render inside a raised card; degrades to a muted line when PantryPal is unreachable.
 */
export function TonightBody() {
  const { data, isPending } = useMeals();
  const tonight = data?.tonight ?? null;

  if (isPending) return <p className={styles.muted}>Loading…</p>;
  if (!data) return <p className={styles.muted}>Unavailable</p>;
  if (!tonight) return <p className={styles.muted}>No dinner planned.</p>;
  return (
    <div className={styles.meal}>
      {tonight.url ? (
        <a href={tonight.url} target="_blank" rel="noreferrer">
          {tonight.title}
        </a>
      ) : (
        tonight.title
      )}
      <small>
        {SLOT_LABEL[tonight.slot]}
        {data.stale ? " · last known plan" : ""}
      </small>
    </div>
  );
}

/** Right-column card chrome around `TonightBody`. */
export function TonightCard() {
  return (
    <>
      <h2 className={styles.cardTitle}>
        <ForkKnife weight="fill" aria-hidden />
        Tonight
        <span className={styles.badge}>PantryPal</span>
      </h2>
      <TonightBody />
    </>
  );
}

/**
 * Compact single-line version for the top of the Meals tab. Hidden at >= 1280px,
 * where the right-column card carries the same information.
 */
export function TonightLine({ enabled = true }: { enabled?: boolean }) {
  const { data, isPending } = useMeals(enabled);
  const tonight = data?.tonight ?? null;

  return (
    <div className={styles.tonightLine}>
      <ForkKnife weight="fill" aria-hidden />
      <b>Tonight</b>
      {isPending ? (
        <span className={styles.muted}>Loading…</span>
      ) : !data ? (
        <span className={styles.muted}>Unavailable</span>
      ) : !tonight ? (
        <span className={styles.muted}>No dinner planned</span>
      ) : (
        <span className={styles.lineTitle}>
          {tonight.url ? (
            <a href={tonight.url} target="_blank" rel="noreferrer">
              {tonight.title}
            </a>
          ) : (
            tonight.title
          )}
        </span>
      )}
      {tonight ? <span className={styles.lineMeta}>{SLOT_LABEL[tonight.slot]}</span> : null}
    </div>
  );
}
