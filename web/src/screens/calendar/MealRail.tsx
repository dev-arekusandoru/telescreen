import { ForkKnife } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { formatDate } from "@/app/localdate";
import { pantrypalWeekUrl, type MealDay, type MealItem } from "@/features/meals";
import { cx } from "@/ui";
import styles from "./MealRail.module.css";
import { SLOT_BADGE, SLOT_LABEL, mealsByDay, visibleMeals } from "./mealRail";

interface Pad {
  left: number;
  right: number;
}

const NO_PAD: Pad = { left: 0, right: 0 };

/**
 * Measure the calendar's day columns and return the left/right inset the rail needs to line up
 * with them. The time gutter and the scrollbar are not part of the grid's own width, so they are
 * read from the rendered columns rather than guessed from a constant.
 */
function useColumnPad(railRef: RefObject<HTMLDivElement | null>, count: number) {
  const [pad, setPad] = useState<Pad>(NO_PAD);
  const apply = useCallback((next: Pad) => {
    setPad((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    const wrap = rail?.parentElement;
    if (!rail || !wrap) return;

    let frame = 0;
    let retries = 0;
    /** Returns false while the grid's columns are not there yet (first paint, view change). */
    const measure = (): boolean => {
      frame = 0;
      const cols = Array.from(
        wrap.querySelectorAll<HTMLElement>(".fc-timegrid-cols td.fc-timegrid-col"),
      ).filter((el) => !el.classList.contains("fc-timegrid-axis"));
      if (cols.length !== count || cols.length === 0) return false;
      const railBox = rail.getBoundingClientRect();
      const first = cols[0]!.getBoundingClientRect();
      const last = cols[cols.length - 1]!.getBoundingClientRect();
      apply({
        left: Math.max(0, Math.round(first.left - railBox.left)),
        right: Math.max(0, Math.round(railBox.right - last.right)),
      });
      return true;
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(run);
    };
    const run = () => {
      // FullCalendar draws its columns after the first paint; retry briefly, then trust resize.
      if (!measure() && retries < 30) {
        retries += 1;
        frame = requestAnimationFrame(run);
      }
    };

    run();
    const observer = new ResizeObserver(schedule);
    observer.observe(wrap);
    window.addEventListener("resize", schedule);
    // The time gutter is sized by the label font, so a late webfont shifts it.
    void globalThis.document.fonts?.ready.then(schedule).catch(() => {});
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [railRef, count, apply]);

  return pad;
}

/**
 * Meals for each visible day, in a fixed-height strip under the calendar's day columns.
 *
 * The rail sits *below* the scrolling grid, so it never overlaps timed events or the all-day row,
 * and reserving the same three rows on every column keeps the week aligned. Meals link into
 * PantryPal; a day without meals is a tappable empty note area that opens that week's plan.
 */
export function MealRail({
  dates,
  days,
  publicUrl,
  today,
}: {
  /** Visible day columns as `YYYY-MM-DD`, in calendar order. */
  dates: readonly string[];
  days: readonly MealDay[] | undefined;
  /** Browser-facing PantryPal base URL (for the empty-day week link); null when unknown. */
  publicUrl: string | null;
  /** Household wall date, for the today tint. */
  today: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const pad = useColumnPad(railRef, dates.length);
  const byDay = useMemo(() => mealsByDay(days), [days]);

  return (
    <div
      ref={railRef}
      className={styles.rail}
      style={{ paddingLeft: pad.left, paddingRight: pad.right }}
      role="region"
      aria-label="Meal plan"
    >
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}
      >
        {dates.map((date) => (
          <DayMeals
            key={date}
            date={date}
            meals={byDay.get(date)}
            publicUrl={publicUrl}
            today={date === today}
          />
        ))}
      </div>
    </div>
  );
}

function DayMeals({
  date,
  meals,
  publicUrl,
  today,
}: {
  date: string;
  meals: MealItem[] | undefined;
  publicUrl: string | null;
  today: boolean;
}) {
  const dayLabel = formatDate(date, { weekday: "long", month: "long", day: "numeric" });
  const weekUrl = pantrypalWeekUrl(publicUrl, date);
  const { shown, hidden } = visibleMeals(meals ?? []);

  if (shown.length === 0) {
    const icon = <ForkKnife className={styles.emptyIcon} aria-hidden />;
    return (
      <div className={styles.cell} data-today={today || undefined}>
        {weekUrl ? (
          <a
            className={cx(styles.box, styles.empty)}
            href={weekUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Plan meals for ${dayLabel} in PantryPal`}
          >
            {icon}
          </a>
        ) : (
          <div className={cx(styles.box, styles.empty)} aria-hidden>
            {icon}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.cell} data-today={today || undefined}>
      <div className={styles.box} role="group" aria-label={`Meals for ${dayLabel}`}>
        {shown.map((meal, index) => (
          <MealChip key={`${meal.slot}-${index}-${meal.title}`} meal={meal} />
        ))}
        {hidden > 0 ? (
          weekUrl ? (
            <a
              className={styles.more}
              href={weekUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`${hidden} more ${hidden === 1 ? "meal" : "meals"} for ${dayLabel} in PantryPal`}
            >
              +{hidden} more
            </a>
          ) : (
            <span className={styles.more}>+{hidden} more</span>
          )
        ) : null}
      </div>
    </div>
  );
}

function MealChip({ meal }: { meal: MealItem }) {
  const label = `${SLOT_LABEL[meal.slot]}: ${meal.title}`;
  const body = (
    <>
      <span className={cx(styles.badge, styles[meal.slot], meal.skipped && styles.skipped)} aria-hidden>
        {SLOT_BADGE[meal.slot]}
      </span>
      <span className={styles.name}>{meal.title}</span>
    </>
  );
  // Freeform and skip slots have no PantryPal page, so they stay plain text.
  return meal.url ? (
    <a className={styles.chip} href={meal.url} target="_blank" rel="noreferrer" aria-label={label} title={meal.title}>
      {body}
    </a>
  ) : (
    <span className={cx(styles.chip, meal.skipped && styles.skippedChip)} aria-label={label} title={meal.title}>
      {body}
    </span>
  );
}
