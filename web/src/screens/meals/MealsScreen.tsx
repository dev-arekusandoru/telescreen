import { CaretLeft, CaretRight, ForkKnife } from "@phosphor-icons/react";
import { addDays, localDate } from "@/app/localdate";
import { useHouseholdClock } from "@/app/useHouseholdClock";
import { errorMessage } from "@/api/errors";
import { useHousehold, useSettings } from "@/features/queries";
import { useMealsBoard, useMealsKitchen } from "@/features/meals";
import { cx, PageHeader } from "@/ui";
import { useEffect, useRef, useState } from "react";
import type { MealsBoard } from "@/features/meals";
import styles from "./Meals.module.css";
import { PAGE_MAX, PAGE_MIN, SLOT_LABEL, pageDays, pageStart, pickHero, weekLabel } from "./model";
import { DayColumn, MealMeta, MealPhoto, PantryPanel, ShoppingPanel } from "./parts";

const PAGES = Array.from({ length: PAGE_MAX - PAGE_MIN + 1 }, (_, i) => PAGE_MIN + i);

function Hero({ board, nextDays, today }: { board: MealsBoard | undefined; nextDays: MealsBoard["days"] | undefined; today: string }) {
  const pick = pickHero(today, board?.days ?? [], nextDays);
  if (!pick) {
    return (
      <div className={styles.heroSlot} data-hero>
        <div className={cx(styles.hero, styles.heroEmpty)}>
          <ForkKnife weight="duotone" aria-hidden size={40} />
          <div>
            <h2>Nothing planned</h2>
            <p>No plan for this week yet. Build one in PantryPal and it will appear here.</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.heroSlot} data-hero>
      <MealPhoto meal={pick.meal} className={styles.hero}>
        <div className={styles.heroText}>
          <small>
            {pick.label} · {SLOT_LABEL[pick.meal.slot]}
          </small>
          <h2>
            {pick.meal.url ? (
              <a href={pick.meal.url} target="_blank" rel="noreferrer">
                {pick.meal.title}
              </a>
            ) : (
              pick.meal.title
            )}
          </h2>
          <div className={styles.metaRow}>
            <MealMeta meal={pick.meal} />
          </div>
        </div>
      </MealPhoto>
    </div>
  );
}

/** One week page: the seven day columns. Only pages near the visible one are fetched. */
function WeekPage({ start, today, enabled }: { start: string; today: string; enabled: boolean }) {
  const { data } = useMealsBoard({ start, end: addDays(start, 7) }, enabled);
  return (
    <div className={styles.page}>
      {pageDays(start).map((date) => (
        <DayColumn key={date} date={date} meals={data?.days.find((day) => day.date === date)?.meals ?? []} today={today} />
      ))}
    </div>
  );
}

/** Meals tab: next-meal hero, swipeable week strip and the read-only shopping/pantry sidebar. */
export function MealsScreen() {
  const { data: settings, isPending: settingsPending } = useSettings();
  const enabled = settings?.modules.meals === true;
  const { data: household } = useHousehold();
  const { now, timeZone } = useHouseholdClock();
  const today = localDate(now, timeZone);
  const weekStart = household?.weekStart ?? 0;

  const currentStart = pageStart(today, weekStart, 0);
  const current = useMealsBoard({ start: currentStart, end: addDays(currentStart, 7) }, enabled);
  const next = useMealsBoard({ start: addDays(currentStart, 7), end: addDays(currentStart, 14) }, enabled);
  const kitchen = useMealsKitchen(enabled);

  const pager = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const visibleStart = pageStart(today, weekStart, page);
  const visible = useMealsBoard({ start: visibleStart, end: addDays(visibleStart, 7) }, enabled);

  const stale = [current.data, next.data, visible.data, kitchen.data].some((data) => data?.stale);
  const failed = enabled && current.isError;
  const loading = settingsPending || (enabled && current.isPending && !current.data);

  // Start on the current week; retry once in case the first stylesheet layout is not in yet.
  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    const place = () => {
      if (el.clientWidth) el.scrollLeft = (0 - PAGE_MIN) * el.clientWidth;
    };
    place();
    const retry = setTimeout(place, 60);
    return () => clearTimeout(retry);
    // The strip only mounts once settings/data settle; later refetches must not re-scroll.
  }, [settingsPending, enabled, loading, failed]);

  const goTo = (target: number) => {
    const el = pager.current;
    const nextPage = Math.max(PAGE_MIN, Math.min(PAGE_MAX, target));
    if (!el) return;
    const left = (nextPage - PAGE_MIN) * el.clientWidth;
    if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior: "smooth" });
    else el.scrollLeft = left;
  };

  const onScroll = (el: HTMLDivElement) => {
    if (!el.clientWidth) return;
    setPage(Math.max(PAGE_MIN, Math.min(PAGE_MAX, Math.round(el.scrollLeft / el.clientWidth) + PAGE_MIN)));
  };

  return (
    <>
      <PageHeader title="Meals" subtitle={weekLabel(visibleStart)}>
        {stale ? <span className={styles.stale}>Last known plan</span> : null}
        {page !== 0 ? (
          <button type="button" className={styles.thisWeek} onClick={() => goTo(0)}>
            This week
          </button>
        ) : null}
        <div className={styles.pagerButtons}>
          <button type="button" aria-label="Previous week" disabled={page <= PAGE_MIN} onClick={() => goTo(page - 1)}>
            <CaretLeft aria-hidden />
          </button>
          <button type="button" aria-label="Next week" disabled={page >= PAGE_MAX} onClick={() => goTo(page + 1)}>
            <CaretRight aria-hidden />
          </button>
        </div>
      </PageHeader>

      {settingsPending ? (
        <p className={styles.muted}>Loading…</p>
      ) : !enabled ? (
        <div className={styles.notice}>
          <ForkKnife weight="duotone" aria-hidden size={36} />
          <p>Meals are turned off. Enable them in Settings &gt; Modules.</p>
        </div>
      ) : loading ? (
        <p className={styles.muted}>Loading this week…</p>
      ) : failed ? (
        <div className={styles.notice}>
          <ForkKnife weight="duotone" aria-hidden size={36} />
          <p>{errorMessage(current.error)}</p>
          <button type="button" onClick={() => void current.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.main}>
            <Hero board={current.data} nextDays={next.data?.days} today={today} />
            <div className={styles.stripWrap}>
              <div
                className={styles.pager}
                ref={pager}
                onScroll={(event) => onScroll(event.currentTarget)}
                aria-label="Meal weeks"
                tabIndex={0}
              >
                {PAGES.map((offset) => (
                  <WeekPage
                    key={offset}
                    start={pageStart(today, weekStart, offset)}
                    today={today}
                    enabled={enabled && Math.abs(offset - page) <= 1}
                  />
                ))}
              </div>
            </div>
          </div>
          <aside className={styles.side}>
            <ShoppingPanel shopping={kitchen.data?.shopping ?? null} />
            <PantryPanel missing={kitchen.data?.missing ?? []} expiring={kitchen.data?.expiring ?? []} />
          </aside>
        </div>
      )}
    </>
  );
}
