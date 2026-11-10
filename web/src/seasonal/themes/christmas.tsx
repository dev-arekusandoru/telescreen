import { useEffect, useRef, useState } from "react";
import reindeer from "../art/christmas/reindeer.svg";
import wreath from "../art/christmas/wreath.svg";
import snowflake from "../art/christmas/snowflake.svg";
import tree from "../art/christmas/tree.svg";
import styles from "./christmas.module.css";
import type { ThemeProps } from "../types";

type Flake = { id: number; x: number; size: number; duration: number; delay: number; shape: number; landed?: boolean };
const makeFlake = (id: number, delay = 0): Flake => ({
  id,
  x: ((id * 0.618034) % 1) * 100,
  size: 14 + (id * 7) % 19,
  duration: 13 + (id * 11) % 13,
  delay,
  shape: id % 3,
});
const initialFlakes = () => Array.from({ length: 9 }, (_, i) => makeFlake(i, -i * 2));
const lights = Array.from({ length: 28 }, (_, i) => i);

export function Christmas({ syncedAt }: ThemeProps) {
  const [flakes, setFlakes] = useState(initialFlakes);
  const [gust, setGust] = useState(false);
  const nextId = useRef(9);
  const lastSync = useRef(syncedAt);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setFlakes((current) => current.length >= 100 ? current : [...current, makeFlake(nextId.current++)]);
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (lastSync.current === syncedAt) return;
    lastSync.current = syncedAt;
    setFlakes((current) => current.map((flake) => ({ ...flake, landed: true })));
    setGust(true);
    const timer = window.setTimeout(() => {
      setFlakes(initialFlakes());
      nextId.current = 9;
      setGust(false);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [syncedAt]);

  return (
    <>
      <div className={styles.lights} aria-hidden="true">
        {lights.map((i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}
      </div>
      <img src={tree} alt="" className={`${styles.tree} ${styles.leftTree}`} />
      <img src={tree} alt="" className={`${styles.tree} ${styles.rightTree}`} />
      <img src={wreath} alt="" className={styles.wreath} />
      {flakes.map((flake) => (
        <span key={flake.id} className={`${styles.flake} ${styles[`shape${flake.shape}`]} ${flake.landed ? styles.landed : ""} ${gust && flake.landed ? styles.gust : ""}`}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && !flake.landed) {
              setFlakes((current) => current.map((item) => item.id === flake.id ? { ...item, landed: true } : item));
            }
          }}
          style={{ "--x": `${flake.x}vw`, "--size": `${flake.size}px`, "--duration": `${flake.duration}s`, "--delay": `${flake.delay}s`, "--lift": `${flake.id % 11}px` } as React.CSSProperties}>
          <img src={snowflake} alt="" />
        </span>
      ))}
      <img src={reindeer} alt="" className={styles.walker} />
    </>
  );
}
