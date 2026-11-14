import { Car, House, Key, MapPin, Plus, Trash } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorMessage } from "@/api/errors";
import { useMembers, useSettings, useUpdateSettings, type UpdateSettings } from "@/features/queries";
import { newDestinationId, travelKeys, useTravelStatus, type TravelDestination, type TravelSettings } from "@/features/travel";
import { TRAVEL_ICONS, type TravelIcon } from "@/screens/travel/icons";
import { Select, Switch, memberColorStyle, type SelectOption } from "@/ui";
import { cx } from "@/ui/cx";
import styles from "./Settings.module.css";
import layout from "./TravelSection.module.css";

/** Mirrors the server cap (`MAX_TRAVEL_DESTINATIONS`). */
const MAX_DESTINATIONS = 20;

const ICON_OPTIONS: SelectOption[] = Object.entries(TRAVEL_ICONS).map(([value, { label }]) => ({ value, label }));
const NO_MEMBER = "none";

/**
 * Text field that commits trimmed text on blur/Enter. Empty text commits `null` when
 * `optional`, otherwise the draft snaps back to the saved value.
 */
function CommitInput({
  label,
  value,
  placeholder,
  maxLength,
  optional = false,
  className,
  onCommit,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  maxLength: number;
  optional?: boolean;
  className?: string;
  onCommit: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);

  const commit = () => {
    const next = draft.trim();
    if (next === (value ?? "")) return setDraft(next);
    if (next === "" && !optional) return setDraft(value ?? "");
    onCommit(next === "" ? null : next);
  };

  return (
    <input
      className={cx(styles.input, className)}
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/** Settings > Travel: enable, home address and any number of destinations (driving times via Google). */
export function TravelSection() {
  const { data: settings } = useSettings();
  const { data: members = [] } = useMembers();
  const { data: status } = useTravelStatus();
  const update = useUpdateSettings();
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const travel = settings?.travel;
  const enabled = settings?.modules.travel ?? false;
  const busy = !settings || update.isPending;
  // Reset rather than invalidate: a failed refetch must not leave the card showing the old destinations.
  const resetTravel = () => queryClient.resetQueries({ queryKey: travelKeys.travel, exact: true });
  const save = (patch: UpdateSettings) => update.mutate(patch, { onSuccess: () => void resetTravel() });
  const saveTravel = (patch: Partial<TravelSettings>) => travel && save({ travel: { ...travel, ...patch } });

  const destinations = travel?.destinations ?? [];
  const editDestination = (id: string, patch: Partial<Pick<TravelDestination, "label" | "address" | "icon" | "memberId">>) =>
    saveTravel({ destinations: destinations.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  const memberOptions: SelectOption[] = [
    { value: NO_MEMBER, label: "No one", dot: memberColorStyle(null) },
    ...members.map((m) => ({ value: m.id, label: m.name, dot: memberColorStyle(m.colorToken) })),
  ];

  const canAdd = !busy && newLabel.trim() !== "" && newAddress.trim() !== "";
  const addDestination = () => {
    if (!canAdd || !travel) return;
    update.mutate(
      {
        travel: {
          ...travel,
          destinations: [...destinations, { id: newDestinationId(), label: newLabel.trim(), address: newAddress.trim(), icon: "pin", memberId: null }],
        },
      },
      {
        onSuccess: () => {
          setNewLabel("");
          setNewAddress("");
          void resetTravel();
        },
      },
    );
  };

  return (
    <section className={styles.sec} aria-labelledby="travel-h">
      <h2 id="travel-h">Travel</h2>

      <div className={styles.row}>
        <Car aria-hidden />
        <div>
          <b>Travel times</b>
          <small>Driving time with live traffic from home, in the right column</small>
        </div>
        <div className={styles.end}>
          <Switch
            label="Travel"
            checked={enabled}
            disabled={busy}
            onCheckedChange={(on) => {
              if (!settings) return;
              save({ modules: { ...settings.modules, travel: on } });
              void queryClient.invalidateQueries({ queryKey: travelKeys.status });
            }}
          />
        </div>
      </div>

      <div className={styles.row}>
        <Key aria-hidden />
        <div>
          <b>Google Maps API key</b>
          <small>
            {status?.configured
              ? "Using GOOGLE_MAPS_API_KEY from the environment"
              : "Not configured. Set GOOGLE_MAPS_API_KEY (Routes API enabled) and restart Telescreen."}
          </small>
        </div>
      </div>

      <div className={styles.row}>
        <House aria-hidden />
        <div>
          <b>Home</b>
          <small>Starting point for every route</small>
        </div>
        <CommitInput
          label="Home address"
          value={travel?.home ?? null}
          placeholder="Street, city"
          maxLength={200}
          optional
          className={layout.home}
          onCommit={(home) => !busy && saveTravel({ home })}
        />
      </div>

      {destinations.map((destination) => (
        <div key={destination.id} className={cx(styles.row, layout.dest)}>
          <MapPin aria-hidden />
          <div className={layout.fields}>
            <CommitInput
              label={`${destination.label} name`}
              value={destination.label}
              placeholder="Name"
              maxLength={40}
              className={layout.name}
              onCommit={(label) => label && !busy && editDestination(destination.id, { label })}
            />
            <CommitInput
              label={`${destination.label} address`}
              value={destination.address}
              placeholder="Address"
              maxLength={200}
              className={layout.address}
              onCommit={(address) => address && !busy && editDestination(destination.id, { address })}
            />
          </div>
          <div className={layout.picks}>
            <Select
              label={`${destination.label} icon`}
              value={destination.icon}
              options={ICON_OPTIONS}
              disabled={busy}
              onValueChange={(icon) => editDestination(destination.id, { icon: icon as TravelIcon })}
            />
            <Select
              label={`${destination.label} person`}
              value={destination.memberId ?? NO_MEMBER}
              options={memberOptions}
              disabled={busy}
              onValueChange={(id) => editDestination(destination.id, { memberId: id === NO_MEMBER ? null : id })}
            />
          </div>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={`Remove ${destination.label}`}
            disabled={busy}
            onClick={() => saveTravel({ destinations: destinations.filter((d) => d.id !== destination.id) })}
          >
            <Trash aria-hidden />
          </button>
        </div>
      ))}

      {destinations.length < MAX_DESTINATIONS ? (
        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault();
            addDestination();
          }}
        >
          <Plus aria-hidden />
          <div className={layout.fields}>
            <input
              className={cx(styles.input, layout.name)}
              aria-label="New destination name"
              placeholder="Name, e.g. Work"
              maxLength={40}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <input
              className={cx(styles.input, layout.address)}
              aria-label="New destination address"
              placeholder="Address"
              maxLength={200}
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
            />
          </div>
          <button type="submit" className={styles.btn} disabled={!canAdd}>
            Add
          </button>
        </form>
      ) : null}

      {update.error ? (
        <p className={styles.err} role="alert">
          {errorMessage(update.error)}
        </p>
      ) : null}
    </section>
  );
}
