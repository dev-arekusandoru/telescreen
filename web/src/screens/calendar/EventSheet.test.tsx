import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { CalendarInfo, EventInstance } from "@/features/calendar";
import { MEMBERS, renderAt, stubApi } from "@/test/api";
import { EventSheet, type EventSheetProps } from "./EventSheet";

const TZ = "Europe/Berlin";

const CALENDARS: CalendarInfo[] = [
  { id: "cal_a", accountId: "acc", name: "Personal", color: "#c4623f", writable: true, enabled: true, memberId: "mem_a", lastSyncedAt: null, lastError: null },
  { id: "cal_b", accountId: "acc", name: "Vale", color: "#5f8a6b", writable: true, enabled: true, memberId: "mem_b", lastSyncedAt: null, lastError: null },
  { id: "cal_ro", accountId: "acc", name: "Holidays", color: "#888888", writable: false, enabled: true, memberId: null, lastSyncedAt: null, lastError: null },
];

const EVENT: EventInstance = {
  id: "evt_1",
  eventId: "evt_1",
  calendarId: "cal_a",
  memberId: "mem_a",
  title: "Dentist",
  start: "2026-11-03T13:00:00.000Z",
  end: "2026-11-03T14:00:00.000Z",
  allDay: false,
  timeZone: "Europe/Berlin",
  location: "Main St",
  notes: null,
  recurring: false,
  repeat: "none",
  writable: true,
};

function setup(overrides: Partial<EventSheetProps> = {}) {
  const props: EventSheetProps = {
    open: true,
    onOpenChange: vi.fn(),
    event: null,
    initial: { start: "2026-11-03T14:00", end: "2026-11-03T15:00", allDay: false },
    calendars: CALENDARS,
    members: MEMBERS as EventSheetProps["members"],
    defaultCalendarId: "cal_b",
    timeZone: TZ,
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<EventSheet {...props} />);
  return props;
}

describe("EventSheet", () => {
  it("creates an event on the member's default writable calendar", async () => {
    const user = userEvent.setup();
    const props = setup();

    const calendar = screen.getByLabelText("Calendar") as HTMLSelectElement;
    expect(calendar.value).toBe("cal_b");
    // Read-only calendars are never offered.
    expect(within(calendar).queryByText(/Holidays/)).toBeNull();

    await user.type(screen.getByLabelText("Title"), "Lunch");
    await user.selectOptions(screen.getByLabelText("Repeat"), "weekly");
    await user.click(screen.getByRole("button", { name: /Add to Vale/ }));

    expect(props.onCreate).toHaveBeenCalledWith({
      calendarId: "cal_b",
      title: "Lunch",
      // 14:00-15:00 Berlin (CET, UTC+1) on 2026-11-03.
      start: "2026-11-03T13:00:00.000Z",
      end: "2026-11-03T14:00:00.000Z",
      allDay: false,
      location: null,
      notes: null,
      repeat: "weekly",
    });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sends date-only values with an exclusive end for all-day events", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.type(screen.getByLabelText("Title"), "Trip");
    await user.click(screen.getByRole("switch", { name: "All day" }));
    await user.click(screen.getByRole("button", { name: /Add to/ }));
    expect(props.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ allDay: true, start: "2026-11-03", end: "2026-11-04" }),
    );
  });

  it("does not save without a title", () => {
    setup();
    expect(screen.getByRole("button", { name: /Add to/ })).toBeDisabled();
  });

  it("edits a single event without a scope prompt", async () => {
    const user = userEvent.setup();
    const props = setup({ event: EVENT, initial: null });
    const title = screen.getByLabelText("Title");
    expect(title).toHaveValue("Dentist");
    await user.clear(title);
    await user.type(title, "Dentist (moved)");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onUpdate).toHaveBeenCalledWith(
      EVENT,
      expect.objectContaining({ title: "Dentist (moved)", start: EVENT.start, end: EVENT.end, repeat: "none" }),
      "all",
    );
  });

  it("asks for a scope when saving a recurring event", async () => {
    const user = userEvent.setup();
    const recurring = { ...EVENT, id: "evt_1__20261103", recurring: true, repeat: "weekly" as const };
    const props = setup({ event: recurring, initial: null });
    await user.type(screen.getByLabelText("Title"), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(props.onUpdate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "This event" }));
    const [, patch, scope] = (props.onUpdate as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(scope).toBe("this");
    // A single occurrence cannot change the series rule.
    expect(patch).not.toHaveProperty("repeat");
  });

  it("asks for a scope when deleting a recurring event", async () => {
    const user = userEvent.setup();
    const recurring = { ...EVENT, recurring: true, repeat: "weekly" as const };
    const props = setup({ event: recurring, initial: null });
    await user.click(screen.getByRole("button", { name: /Delete event/ }));
    await user.click(screen.getByRole("button", { name: "All events" }));
    expect(props.onDelete).toHaveBeenCalledWith(recurring, "all");
  });

  it("deletes a one-off event immediately", async () => {
    const user = userEvent.setup();
    const props = setup({ event: EVENT, initial: null });
    await user.click(screen.getByRole("button", { name: /Delete event/ }));
    expect(props.onDelete).toHaveBeenCalledWith(EVENT, "all");
  });

  it("opens read-only events view-only", () => {
    setup({ event: { ...EVENT, calendarId: "cal_ro", memberId: null, writable: false }, initial: null });
    expect(screen.getByText("Dentist")).toBeInTheDocument();
    expect(screen.getByText(/read-only/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  });
});

describe("calendar screen", () => {
  it("mounts, and the + button opens the new event sheet", async () => {
    stubApi();
    const user = userEvent.setup();
    renderAt("/calendar");
    await user.click(await screen.findByRole("button", { name: "Add event" }));
    expect(await screen.findByRole("heading", { name: "New event" })).toBeInTheDocument();
    expect(screen.getByText(/No writable calendars/)).toBeInTheDocument();
  });
});
