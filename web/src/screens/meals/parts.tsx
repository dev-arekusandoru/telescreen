import { Check, Warning } from "@phosphor-icons/react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { formatDate } from "@/app/localdate";
import type { BoardMeal, MealsKitchen } from "@/features/meals";
import { cx } from "@/ui";
import styles from "./Meals.module.css";
import { expiryLabel, placeholderFor, shoppingGroups } from "./model";

/** Recipe photo when PantryPal has one, otherwise a deterministic tinted placeholder. */
export function MealPhoto({
  meal,
  className,
  children,
}: {
  meal: BoardMeal;
  className?: string;
  children?: ReactNode;
}) {
  const { hue, emoji } = placeholderFor(meal.title);
  const [failed, setFailed] = useState(false);
  const src = meal.imageUrl && !failed ? meal.imageUrl : null;
  return (
    <div
      className={cx(styles.photo, meal.skipped && styles.photoSkipped, className)}
      style={{ "--h": hue } as CSSProperties}
    >
      {src ? (
        <img className={styles.photoImg} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className={styles.photoEmoji} aria-hidden>
          {emoji}
        </span>
      )}
      {children}
    </div>
  );
}

export function MealMeta({ meal }: { meal: BoardMeal }) {
  const leftover = meal.leftover && meal.cookedOn;
  return (
    <>
      {meal.minutes ? <span>{meal.minutes} min</span> : null}
      {meal.cuisine ? <span>{meal.cuisine}</span> : null}
      {leftover ? (
        <span className={styles.leftover}>
          ↻ from <Weekday date={meal.cookedOn!} />
        </span>
      ) : null}
    </>
  );
}

export function Weekday({ date }: { date: string }) {
  return <>{formatDate(date, { weekday: "short" })}</>;
}

/** One day column: header plus the three fixed meal rows, snacks/desserts as a tiny line below. */
export function DayColumn({
  date,
  meals,
  today,
}: {
  date: string;
  meals: BoardMeal[];
  today: string;
}) {
  const weekday = formatDate(date, { weekday: "short" });
  const number = formatDate(date, { day: "numeric" });
  const extras = meals.filter((meal) => meal.slot === "snack" || meal.slot === "dessert");
  return (
    <article
      className={cx(styles.day, date === today && styles.today, date < today && styles.past)}
      data-date={date}
      data-past={date < today || undefined}
      aria-current={date === today ? "date" : undefined}
      aria-label={`${weekday} ${number}`}
    >
      <header className={styles.dayHead}>
        <b>{weekday}</b>
        <span>{number}</span>
      </header>
      <div className={styles.slots}>
        {(["breakfast", "lunch", "dinner"] as const).map((slot) => {
          const meal = meals.find((m) => m.slot === slot);
          if (!meal) return <div key={slot} className={styles.tileEmpty} />;
          const tile = (
            <MealPhoto meal={meal} className={styles.tilePhoto}>
              <span className={styles.tileTitle}>{meal.title}</span>
              {meal.leftover && meal.cookedOn ? (
                <span className={styles.tileLeftover}>
                  ↻ <Weekday date={meal.cookedOn} />
                </span>
              ) : null}
            </MealPhoto>
          );
          return meal.url ? (
            <a
              key={slot}
              className={styles.tileLink}
              href={meal.url}
              target="_blank"
              rel="noreferrer"
              aria-label={meal.title}
            >
              {tile}
            </a>
          ) : (
            <div key={slot} className={styles.tileLink}>
              {tile}
            </div>
          );
        })}
      </div>
      {extras.length ? (
        <div className={styles.extras}>
          {extras.map((meal) => (
            <span key={`${meal.slot}-${meal.title}`} className={cx(meal.skipped && styles.extraSkipped)}>
              {placeholderFor(meal.title).emoji} {meal.title}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Panel({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>
        {title}
        {meta ? <span className={styles.panelMeta}>{meta}</span> : null}
      </h2>
      {children}
    </section>
  );
}

export function ShoppingPanel({ shopping }: { shopping: MealsKitchen["shopping"] }) {
  if (!shopping) {
    return (
      <Panel title="Shopping">
        <p className={styles.muted}>No shopping list.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Shopping" meta={`${shopping.left} of ${shopping.total} left`}>
      {shoppingGroups(shopping, 2).map((group) => (
        <div key={group.category} className={styles.shopGroup}>
          <h3>
            {group.category}
            {group.more > 0 ? <span className={styles.more}>+{group.more}</span> : null}
          </h3>
          {group.items.map((item) => (
            <div key={item.name} className={styles.shopItem}>
              <span className={styles.box} aria-hidden />
              <span className={styles.shopName}>{item.name}</span>
              {item.needsCheck ? <span className={styles.chip}>check</span> : null}
              {item.qty ? <span className={styles.shopQty}>{item.qty}</span> : null}
            </div>
          ))}
        </div>
      ))}
    </Panel>
  );
}

export function PantryPanel({ missing, expiring }: { missing: MealsKitchen["missing"]; expiring: MealsKitchen["expiring"] }) {
  return (
    <Panel title="Pantry watch">
      <div className={styles.pantryBlock}>
        <h3>
          <Warning weight="fill" size={14} aria-hidden />
          Missing for this week
        </h3>
        {missing.length === 0 ? (
          <p className={styles.muted}>Nothing missing.</p>
        ) : (
          missing.slice(0, 3).map((row) => (
            <div key={row.name} className={styles.pantryRow}>
              <span className={styles.pantryName}>{row.name}</span>
              <span className={styles.pantryNote}>{row.detail}</span>
            </div>
          ))
        )}
      </div>
      <div className={styles.pantryBlock}>
        <h3>Expiring soon</h3>
        {expiring.length === 0 ? (
          <p className={styles.muted}>Nothing expiring.</p>
        ) : (
          expiring.slice(0, 3).map((row) => (
            <div key={`${row.name}-${row.expiresOn}`} className={styles.pantryRow}>
              <span className={styles.pantryName}>{row.name}</span>
              <span className={styles.pantryNote}>{expiryLabel(row.daysLeft)}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
