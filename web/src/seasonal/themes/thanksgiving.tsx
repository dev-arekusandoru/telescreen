import { useEffect, useRef, useState } from "react";
import chestnut from "../art/thanksgiving/chestnut.svg";
import flutterGold from "../art/thanksgiving/flutter-gold.svg";
import flutterOrange from "../art/thanksgiving/flutter-orange.svg";
import flutterRust from "../art/thanksgiving/flutter-rust.svg";
import leaf from "../art/thanksgiving/leaf.svg";
import leafDark from "../art/thanksgiving/leaf-dark.svg";
import leafGold from "../art/thanksgiving/leaf-gold.svg";
import maple from "../art/thanksgiving/maple.svg";
import mapleGold from "../art/thanksgiving/maple-gold.svg";
import mapleOrange from "../art/thanksgiving/maple-orange.svg";
import turkey from "../art/thanksgiving/turkey.svg";
import styles from "./thanksgiving.module.css";
import type { ThemeProps } from "../types";

const LEAVES = [maple, flutterGold, leaf, mapleOrange, flutterRust, leafGold, mapleGold, flutterOrange, leafDark];
const ACORN_CHANCE = 0.25;
const pick = () => (Math.random() < ACORN_CHANCE ? chestnut : LEAVES[Math.floor(Math.random() * LEAVES.length)] ?? leaf);
const SPAWN_MS = 1700;
const BLOW_MS = 2600;

type Leaf = { id: number; x: number; size: number; src: string; dur: number; delay: number; sway: number; lift: number; landed: boolean };

/** Position and timing come from the id (golden-ratio sequence) so leaves spread evenly; the kind is random. */
function makeLeaf(id: number, delay = 0): Leaf {
  const t = (id * 0.618034) % 1;
  const u = (id * 0.381966 + 0.17) % 1;
  return {
    id,
    x: t * 96,
    size: Math.round(18 + u * 10),
    src: pick(),
    dur: 18 + u * 12,
    delay,
    sway: Math.round(14 + t * 22),
    lift: (id * 7) % 12,
    landed: false,
  };
}

const seed = () => Array.from({ length: 8 }, (_, i) => makeLeaf(i, -(i / 8) * 22));

/**
 * Leaves fall from the top and stay where they land, piling along the bottom. When `syncedAt`
 * changes (calendar sync: the user's interval, or a manual tap) the landed leaves blow away.
 * The pile has no cap; it only resets on a sync.
 */
export function Thanksgiving({ syncedAt }: ThemeProps) {
  const [leaves, setLeaves] = useState<Leaf[]>(seed);
  const [blowing, setBlowing] = useState<ReadonlySet<number>>(new Set());
  const nextId = useRef(8);
  const lastSync = useRef(syncedAt);
  const landedIds = useRef<number[]>([]);
  landedIds.current = leaves.filter((l) => l.landed).map((l) => l.id);

  useEffect(() => {
    // Reduced motion hides the leaves (no landings), so don't pile up invisible nodes either.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setLeaves((ls) => [...ls, makeLeaf(nextId.current++)]), SPAWN_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (lastSync.current === syncedAt) return;
    lastSync.current = syncedAt;
    const ids = landedIds.current.filter((id) => !blowing.has(id));
    if (ids.length === 0) return;
    setBlowing((b) => new Set([...b, ...ids]));
    setTimeout(() => {
      setLeaves((ls) => ls.filter((l) => !ids.includes(l.id)));
      setBlowing((b) => new Set([...b].filter((id) => !ids.includes(id))));
    }, BLOW_MS);
  }, [syncedAt, blowing]);

  return (
    <>
      {leaves.map((l) => (
        <span
          key={l.id}
          className={[styles.leaf, l.landed && styles.landed, blowing.has(l.id) && styles.blow].filter(Boolean).join(" ")}
          style={
            {
              "--x": `${l.x.toFixed(1)}vw`,
              "--size": `${l.size}px`,
              "--dur": `${l.dur.toFixed(1)}s`,
              "--delay": `${l.delay.toFixed(1)}s`,
              "--sway": `${l.sway}px`,
              "--lift": `${l.lift}px`,
              "--wind": `${(l.id * 53) % 40 * 10}ms`,
            } as React.CSSProperties
          }
          // The inner img's sway iterations bubble up; only the outer fall ending counts as a landing.
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && e.animationName.includes("fall")) {
              setLeaves((ls) => ls.map((x) => (x.id === l.id ? { ...x, landed: true } : x)));
            }
          }}
        >
          <img src={l.src} alt="" />
        </span>
      ))}
      <img src={turkey} alt="" className={`${styles.turkey} ${styles.railTurkey}`} />
      <img src={turkey} alt="" className={`${styles.turkey} ${styles.walker}`} />
    </>
  );
}
