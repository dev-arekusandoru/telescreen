import { ForkKnife } from "@phosphor-icons/react";
import { addDays, formatDate, localDate } from "@/app/localdate";
import { useHouseholdClock } from "@/app/useHouseholdClock";
import { errorMessage } from "@/api/errors";
import { useMeals, type MealDay, type MealItem } from "@/features/meals";
import { useSettings } from "@/features/queries";
import { cx, PageHeader } from "@/ui";
import styles from "./Meals.module.css";
import { TonightLine } from "./TonightCard";

const SLOT_LABEL: Record<MealItem["slot"], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
};

function MealRow({ meal }: { meal: MealItem }) {
  const title = meal.url ? (
    <a href={meal.url} target="_blank" rel="noreferrer">
      {meal.title}
    </a>
  ) : (
    <span className={styles.title}>{meal.title}</span>
  );
  return (
    <div className={cx(styles.mealRow, meal.skipped && styles.skipped)}>
      <span className={styles.slot}>{SLOT_LABEL[meal.slot]}</span>
      {title}
    </div>
  );
}

function DayCard({ day, today }: { day: MealDay; today: string | undefined }) {
  const isToday = day.date === today;
  return (
    <article
      className={cx(styles.day, isToday && styles.today)}
      aria-current={isToday ? "date" : undefined}
      aria-label={formatDate(day.date, { weekday: "long", month: "long", day: "numeric" })}
    >
      <header className={styles.dayHead}>
        <small>{formatDate(day.date, { weekday: "short" })}</small>
        <small>{formatDate(day.date, { month: "short" })}</small>
        <b>{formatDate(day.date, { day: "numeric" })}</b>
      </header>
      {day.meals.length === 0 ? (
        <p className={styles.emptyDay}>No meals planned</p>
      ) : (
        day.meals.map((meal, index) => <MealRow key={`${meal.slot}-${index}`} meal={meal} />)
      )}
    </article>
  );
}

/** Meals tab: the PantryPal week, today highlighted, recipes open in a new tab. */
export function MealsScreen() {
  const { data: settings, isPending: settingsPending } = useSettings();
  const enabled = settings?.modules.meals === true;
  const { data, isPending, isError, error, refetch } = useMeals(enabled);
  const { now, timeZone } = useHouseholdClock();
  const today = localDate(now, timeZone);

  const subtitle = data
    ? `${formatDate(data.weekStart, { month: "short", day: "numeric" })} – ${formatDate(addDays(data.weekStart, 6), {
        month: "short",
        day: "numeric",
      })}`
    : "This week from PantryPal";

  return (
    <>
      <PageHeader title="Meals" subtitle={subtitle}>
        {data?.stale ? <span className={styles.stale}>Last known plan</span> : null}
      </PageHeader>
      <TonightLine enabled={enabled} />
      <div className={styles.wrap}>
        {settingsPending ? (
          <p className={styles.muted}>Loading…</p>
        ) : !enabled ? (
          <div className={styles.notice}>
            <ForkKnife weight="duotone" aria-hidden size={36} />
            <p>Meals are turned off. Enable them in Settings &gt; Modules.</p>
          </div>
        ) : isPending ? (
          <p className={styles.muted}>Loading this week…</p>
        ) : isError ? (
          <div className={styles.notice}>
            <ForkKnife weight="duotone" aria-hidden size={36} />
            <p>{errorMessage(error)}</p>
            <button type="button" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        ) : !data || data.week.length === 0 ? (
          <div className={styles.notice}>
            <ForkKnife weight="duotone" aria-hidden size={36} />
            <p>No plan for this week yet. Build one in PantryPal and it will appear here.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {data.week.map((day) => (
              <DayCard key={day.date} day={day} today={today} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
