import type { DatesSetArg, DayHeaderContentArg, EventClickArg, EventContentArg, EventInput } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { CaretLeft, CaretRight, Plus } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { timeOfDay } from "@/app/dates";
import { MemberChips } from "@/app/MemberChips";
import { useHouseholdClock } from "@/app/useHouseholdClock";
import { useMediaQuery } from "@/app/useMediaQuery";
import { WidgetsButton } from "@/app/WidgetsButton";
import {
  useCalendars,
  useEventActions,
  useEvents,
  useSyncNow,
  type CalendarInfo,
  type EventInstance,
} from "@/features/calendar";
import { useHousehold, useMembers, useSettings, type Member, type Settings } from "@/features/queries";
import { useMealsPlan, useMealsStatus } from "@/features/meals";
import { PageHeader, SegmentedControl, Surface, cx } from "@/ui";
import { WeatherChip } from "@/screens/weather/WeatherChip";
import styles from "./Calendar.module.css";
import { EventSheet, type SheetInitial } from "./EventSheet";
import { MealRail } from "./MealRail";
import { hasPlannedMeals } from "./mealRailData";
import { useIdleReturn, useStoredState } from "./hooks";
import { addDays, addMinutes, dateInZone, fcDateToWall, instantToWall, wallToInstant, zoneLabel } from "./tz";

type View = "week" | "day" | "month" | "schedule";

const VIEWS: ReadonlyArray<{ value: View; label: string }> = [
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
  { value: "schedule", label: "Schedule" },
];

const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin];

/** FullCalendar view for each app view. `rolling` = 7 days starting today (custom view below). */
function fcViewName(view: View, weekMode: Settings["weekMode"]): string {
  switch (view) {
    case "week":
      return weekMode === "fixed" ? "timeGridWeek" : "rolling";
    case "day":
      return "timeGridDay";
    case "month":
      return "dayGridMonth";
    case "schedule":
      return "schedule";
  }
}

/** Serif day header (weekday over date) for the time-grid views only; month/list keep the default text. */
function renderDayHeader(arg: DayHeaderContentArg) {
  return (
    <span className={styles.dh}>
      <small>{utcFormat({ weekday: "short" }, arg.date)}</small>
      <span className={styles.dn}>{arg.date.getUTCDate()}</span>
    </span>
  );
}

const VIEWS_CONFIG = {
  timeGrid: { dayHeaderContent: renderDayHeader },
  rolling: { type: "timeGrid", duration: { days: 7 }, dateAlignment: "day" },
  schedule: { type: "list", duration: { days: 14 }, dateAlignment: "day" },
} as const;

const FAMILY = "family";
const COLOR_CLASSES: Record<string, string | undefined> = {
  terracotta: styles["c-terracotta"],
  sage: styles["c-sage"],
  ochre: styles["c-ochre"],
  plum: styles["c-plum"],
  slate: styles["c-slate"],
  rose: styles["c-rose"],
};

type SheetState = { kind: "create"; initial: SheetInitial } | { kind: "edit"; event: EventInstance };

const utcFormat = (options: Intl.DateTimeFormatOptions, d: Date) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(d);

function rangeTitle(view: string, arg: DatesSetArg): string {
  const start = arg.start;
  const last = new Date(arg.end.getTime() - 86_400_000);
  if (view === "dayGridMonth") return utcFormat({ month: "long", year: "numeric" }, arg.view.currentStart);
  if (view === "timeGridDay") return utcFormat({ weekday: "long", month: "short", day: "numeric" }, start);
  const sameMonth = start.getUTCMonth() === last.getUTCMonth();
  const a = utcFormat({ month: "short", day: "numeric" }, start);
  const b = utcFormat(sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" }, last);
  return `${a} – ${b}`;
}

function scrolledAncestor(el: EventTarget | null, stop: HTMLElement | null): boolean {
  let node = el instanceof HTMLElement ? el : null;
  while (node && node !== stop) {
    if (node.scrollTop > 0) return true;
    node = node.parentElement;
  }
  return false;
}

function scrollTimeFor(wallNow: string): string {
  const hour = Math.max(0, Number(wallNow.slice(11, 13)) - 1);
  return `${String(hour).padStart(2, "0")}:00:00`;
}

/** Default calendar for new events: the active member's configured default, else their first writable one. */
function pickCalendar(
  calendars: readonly CalendarInfo[],
  defaults: Settings["defaultWriteCalendarId"] | undefined,
  activeMemberId: string | null,
): string | null {
  const writable = calendars.filter((c) => c.writable && c.enabled);
  const preferred = activeMemberId ? defaults?.[activeMemberId] : null;
  return (
    writable.find((c) => c.id === preferred)?.id ??
    writable.find((c) => c.memberId === activeMemberId)?.id ??
    writable[0]?.id ??
    null
  );
}

export function CalendarScreen() {
  const { now, timeZone } = useHouseholdClock();
  const { data: household } = useHousehold();
  const { data: members = [] } = useMembers();
  const { data: settings } = useSettings();
  // The right column appears at 1280px (SPEC §8); below that its widgets live in the header.
  const wide = useMediaQuery("(min-width: 1280px)");
  // The temperature chip keeps its own place while the one-row header has room for it. Below
  // that it joins the At-a-glance popup, which is the only way to keep the title and controls
  // on one row at 768px.
  const chipFits = useMediaQuery("(min-width: 960px)");
  const modules = settings?.modules;
  const hasWidgets =
    modules?.weather === true || modules?.meals === true || modules?.music === true || modules?.travel === true;
  const widgetColumn = wide && hasWidgets;
  const showWeatherChip = !widgetColumn && chipFits && modules?.weather === true;
  const { data: calendars = [] } = useCalendars();
  const sync = useSyncNow();
  const actions = useEventActions();

  // View mode survives reloads; an unknown stored value (or none) falls back to Day on phones, Week elsewhere.
  const [storedViewId, setView] = useStoredState<string>("hh-cal-view", "");
  const view: View =
    VIEWS.find((v) => v.value === storedViewId)?.value ??
    (globalThis.matchMedia?.("(max-width: 599px)").matches ? "day" : "week");
  const [range, setRange] = useState<{ start: string; end: string; wallStart: string; days: number } | null>(null);
  const [rangeLabel, setRangeLabel] = useState("");
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [hidden, setHidden] = useStoredState<string[]>("hh-cal-hidden", []);
  const [activeMemberId, setActiveMemberId] = useStoredState<string | null>("hh-cal-active-member", null);
  const calRef = useRef<FullCalendar>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; atTop: boolean } | null>(null);

  const weekMode = settings?.weekMode ?? "rolling";
  const fcView = fcViewName(view, weekMode);
  const tz = timeZone;
  const wallNow = tz ? instantToWall(now, tz) : "";
  // Scroll position for the first render only (a later change would yank the grid around).
  const initialScroll = useRef<string | null>(null);
  if (tz && initialScroll.current === null) initialScroll.current = scrollTimeFor(wallNow);
  const getNow = useCallback(() => new Date(`${instantToWall(new Date(), tz ?? "UTC")}Z`), [tz]);

  const { data: instances = [] } = useEvents(range);

  // Meals for the visible week/day: Month and Schedule show no meals, so nothing is fetched there.
  // PantryPal being unreachable only means no rail — the calendar never waits on it.
  const mealDates = useMemo(() => {
    if (!range || (view !== "week" && view !== "day")) return null;
    const first = range.wallStart.slice(0, 10);
    return Array.from({ length: range.days }, (_, index) => addDays(first, index));
  }, [range, view]);
  const mealRange = useMemo(() => {
    if (!mealDates || mealDates.length === 0) return null;
    return { start: mealDates[0]!, end: addDays(mealDates[mealDates.length - 1]!, 1) };
  }, [mealDates]);
  const { data: mealPlan } = useMealsPlan(mealRange, settings?.modules.meals === true);
  const { data: mealsStatus } = useMealsStatus();
  const showMealRail = mealDates !== null && hasPlannedMeals(mealPlan?.days);

  // Whether "Today" is redundant (today is inside the visible range); computed once for both
  // the header button and the new-event default time. Until the first datesSet, the initial view
  // is today's, so hide the button rather than flash it.
  const todayInRange = range === null || (range.start <= now.toISOString() && now.toISOString() < range.end);

  const memberById = useMemo(() => new Map(members.map((m: Member) => [m.id, m])), [members]);

  const fcEvents = useMemo<EventInput[]>(() => {
    if (!tz) return [];
    const today = wallNow.slice(0, 10);
    return instances
      .filter((e) => !hidden.includes(e.memberId ?? FAMILY))
      .map((e) => {
        const token = e.memberId ? memberById.get(e.memberId)?.colorToken : undefined;
        const past = e.allDay ? e.end <= today : new Date(e.end) < now;
        return {
          id: e.id,
          title: e.title,
          start: e.allDay ? e.start : instantToWall(e.start, tz),
          end: e.allDay ? e.end : instantToWall(e.end, tz),
          allDay: e.allDay,
          editable: false,
          classNames: [styles.ev, COLOR_CLASSES[token ?? ""] ?? styles["c-family"], past && styles.past].filter(Boolean) as string[],
          extendedProps: { instance: e },
        };
      });
  }, [instances, hidden, memberById, tz, now, wallNow]);

  useEffect(() => {
    calRef.current?.getApi().changeView(fcView);
  }, [fcView]);

  const goToday = useCallback(() => {
    const api = calRef.current?.getApi();
    if (!api) return;
    api.today();
    api.scrollToTime(scrollTimeFor(wallNow));
  }, [wallNow]);

  useIdleReturn(settings?.idleReturnMinutes ?? 2, () => {
    setSheet(null);
    goToday();
  });

  const onDatesSet = useCallback(
    (arg: DatesSetArg) => {
      if (!tz) return;
      const wallStart = fcDateToWall(arg.start);
      const next = {
        start: wallToInstant(wallStart, tz).toISOString(),
        end: wallToInstant(fcDateToWall(arg.end), tz).toISOString(),
        wallStart,
        // FullCalendar's window is whole days in UTC, so the difference is exact.
        days: Math.max(1, Math.round((arg.end.getTime() - arg.start.getTime()) / 86_400_000)),
      };
      setRange((prev) => (prev && prev.start === next.start && prev.end === next.end ? prev : next));
      setRangeLabel(rangeTitle(arg.view.type, arg));
    },
    [tz],
  );

  function openCreate(initial?: SheetInitial) {
    if (!tz) return;
    if (!initial) {
      if (todayInRange) {
        const nextHour = addMinutes(`${wallNow.slice(0, 13)}:00:00`, 60);
        initial = { start: nextHour, end: addMinutes(nextHour, 60), allDay: false };
      } else {
        const start = `${(range?.wallStart ?? wallNow).slice(0, 10)}T09:00:00`;
        initial = { start, end: addMinutes(start, 60), allDay: false };
      }
    }
    setSheet({ kind: "create", initial });
  }

  function onDateClick(arg: DateClickArg) {
    if (arg.view.type === "dayGridMonth") {
      const api = calRef.current?.getApi();
      setView("day");
      api?.changeView("timeGridDay", arg.date);
      return;
    }
    if (arg.allDay) {
      const date = fcDateToWall(arg.date).slice(0, 10);
      openCreate({ start: date, end: addDays(date, 1), allDay: true });
      return;
    }
    const start = fcDateToWall(arg.date);
    openCreate({ start, end: addMinutes(start, 60), allDay: false });
  }

  function onEventClick(arg: EventClickArg) {
    const instance = arg.event.extendedProps.instance as EventInstance;
    if (instance.id.startsWith("tmp-")) return;
    setSheet({ kind: "edit", event: instance });
  }

  function toggleMember(id: string) {
    const nowHidden = !hidden.includes(id);
    setHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    if (!nowHidden) setActiveMemberId(id);
  }

  const step = (dir: "prev" | "next") => {
    const api = calRef.current?.getApi();
    if (dir === "prev") api?.prev();
    else api?.next();
  };

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY, atTop: !scrolledAncestor(e.target, wrapRef.current) } : null;
  }

  function onTouchEnd(e: TouchEvent) {
    const start = touch.current;
    const end = e.changedTouches[0];
    touch.current = null;
    if (!start || !end) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) {
      step(dx < 0 ? "next" : "prev");
    } else if (dy > 90 && Math.abs(dx) < 40 && start.atTop && !sync.isPending) {
      sync.mutate();
    }
  }

  const renderEvent = useCallback((arg: EventContentArg) => {
    const e = arg.event.extendedProps.instance as EventInstance;
    const type = arg.view.type;
    const clock = (d: Date | null) =>
      d ? utcFormat({ hour: "numeric", minute: "2-digit" }, d) : "";
    if (type === "listWeek" || type === "schedule" || type.startsWith("list")) {
      return (
        <>
          {e.title}
          {e.location ? <small>{e.location}</small> : null}
        </>
      );
    }
    const detail = e.allDay ? "" : `${clock(arg.event.start)} – ${clock(arg.event.end)}${e.location ? ` · ${e.location}` : ""}`;
    return (
      <span className={styles.main}>
        <b>{e.title}</b>
        {detail ? <small>{detail}</small> : null}
      </span>
    );
  }, []);

  // Skylight-style title: household name with the muted household-time clock on the same baseline.
  const subtitle = tz ? <span title={zoneLabel(now, tz)}>{timeOfDay(now, tz)}</span> : null;

  const sheetCalendarId = pickCalendar(calendars, settings?.defaultWriteCalendarId, activeMemberId);

  return (
    <>
      <PageHeader title={household?.name ?? " "} subtitle={subtitle} dense>
        <div className={styles.controls}>
          {/* Today is rendered only while it can move the view, so it never reserves a gap. */}
          {todayInRange ? null : (
            <button type="button" className={styles.today} onClick={goToday}>
              Today
            </button>
          )}
          <div className={styles.navGroup}>
            <button type="button" className={styles.chev} aria-label="Previous" onClick={() => step("prev")}>
              <CaretLeft aria-hidden />
            </button>
            <button type="button" className={styles.chev} aria-label="Next" onClick={() => step("next")}>
              <CaretRight aria-hidden />
            </button>
          </div>
          <span className={styles.range} aria-live="polite">
            {rangeLabel}
          </span>
          <MemberChips hidden={hidden} onToggle={toggleMember} />
          {/* Below 1280px the right column is hidden; weather and the other widgets move here. */}
          {showWeatherChip ? (
            <div className={styles.wx}>
              <WeatherChip />
            </div>
          ) : null}
          {!widgetColumn && hasWidgets ? <WidgetsButton includeWeather={!chipFits} /> : null}
          <SegmentedControl label="Calendar view" value={view} onChange={setView} options={VIEWS} small />
        </div>
      </PageHeader>
      <Surface>
        <div ref={wrapRef} className={styles.wrap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {tz && household ? (
            <FullCalendar
              ref={calRef}
              plugins={PLUGINS}
              timeZone="UTC"
              now={getNow}
              initialDate={new Date(`${dateInZone(new Date(), tz)}T00:00:00Z`)}
              initialView={fcView}
              views={VIEWS_CONFIG}
              firstDay={household.weekStart}
              headerToolbar={false}
              height="100%"
              events={fcEvents}
              datesSet={onDatesSet}
              nowIndicator
              scrollTime={initialScroll.current ?? "06:00:00"}
              slotDuration="00:30:00"
              slotLabelInterval="01:00"
              slotLabelFormat={{ hour: "numeric", minute: "2-digit", omitZeroMinute: true, meridiem: "short" }}
              allDayText="all-day"
              slotEventOverlap={false}
              eventDisplay="block"
              dayMaxEvents
              fixedWeekCount={false}
              selectable
              selectMirror
              unselectAuto
              longPressDelay={300}
              selectLongPressDelay={300}
              dateClick={onDateClick}
              select={(arg) => {
                // Single-slot clicks are handled by dateClick; this is for dragged ranges.
                const span = arg.end.getTime() - arg.start.getTime();
                const single = arg.allDay ? span <= 86_400_000 : span <= 30 * 60_000;
                arg.view.calendar.unselect();
                if (single || arg.view.type === "dayGridMonth") return;
                const start = fcDateToWall(arg.start);
                openCreate({ start, end: fcDateToWall(arg.end), allDay: arg.allDay });
              }}
              eventClick={onEventClick}
              moreLinkClick={(arg) => {
                setView("day");
                calRef.current?.getApi().changeView("timeGridDay", arg.date);
                return "none";
              }}
              eventContent={renderEvent}
              dayHeaderFormat={{ weekday: "short" }}
              dayCellContent={(arg) => String(arg.date.getUTCDate())}
              listDayFormat={{ weekday: "long" }}
              listDaySideFormat={{ month: "short", day: "numeric" }}
              noEventsContent="Nothing scheduled"
              moreLinkContent={(arg) => `+${arg.num} more`}
            />
          ) : null}
          {showMealRail && mealDates ? (
            <MealRail
              dates={mealDates}
              days={mealPlan?.days}
              publicUrl={mealsStatus?.publicUrl ?? null}
              today={wallNow.slice(0, 10)}
            />
          ) : null}
        </div>
        <button
          type="button"
          className={cx(styles.fab, showMealRail && styles.fabRaised)}
          aria-label="Add event"
          onClick={() => openCreate()}
        >
          <Plus weight="bold" aria-hidden />
        </button>
      </Surface>
      {tz ? (
        <EventSheet
          open={sheet !== null}
          onOpenChange={(open) => {
            if (!open) setSheet(null);
          }}
          event={sheet?.kind === "edit" ? sheet.event : null}
          initial={sheet?.kind === "create" ? sheet.initial : null}
          calendars={calendars}
          members={members}
          defaultCalendarId={sheetCalendarId}
          timeZone={tz}
          onCreate={(fields) => actions.create(fields, calendars)}
          onUpdate={actions.update}
          onDelete={actions.remove}
        />
      ) : null}
    </>
  );
}
