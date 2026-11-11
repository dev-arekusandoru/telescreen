import { useEffect, useRef, useState } from "react";
import hearts from "../art/valentines/hearts.svg";
import sparklingHeart from "../art/valentines/sparkling-heart.svg";
import loveLetter from "../art/valentines/love-letter.svg";
import styles from "./valentines.module.css";
import type { ThemeProps } from "../types";

const HEARTS = [hearts, sparklingHeart];
type Heart = { id: number; x: number; size: number; src: string; duration: number; delay: number; sway: number };
const makeHeart = (id: number, delay = 0): Heart => ({
  id, x: (id * 0.618034 * 100) % 94 + 3, size: 17 + (id * 7) % 15,
  src: HEARTS[id % HEARTS.length]!, duration: 13 + (id * 5) % 8, delay, sway: 10 + (id * 11) % 24,
});
const seed = () => Array.from({ length: 6 }, (_, i) => makeHeart(i, -i * 2));

export function Valentines({ syncedAt }: ThemeProps) {
  const [items, setItems] = useState(seed);
  const nextId = useRef(6);
  const lastSync = useRef(syncedAt);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        setItems((old) => [...old, makeHeart(nextId.current++)].slice(-120));
      }
    }, 2300);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (lastSync.current === syncedAt) return;
    lastSync.current = syncedAt;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = nextId.current;
    nextId.current += 10;
    setItems((old) => [...old, ...Array.from({ length: 10 }, (_, i) => makeHeart(id + i, -i * 0.12))].slice(-120));
  }, [syncedAt]);

  return <>
    {items.map((heart) => <span key={heart.id} className={styles.heart} style={{
      "--x": `${heart.x}vw`, "--size": `${heart.size}px`, "--duration": `${heart.duration}s`,
      "--delay": `${heart.delay}s`, "--sway": `${heart.sway}px`,
    } as React.CSSProperties} onAnimationEnd={(event) => {
      if (event.target === event.currentTarget) setItems((old) => old.filter((item) => item.id !== heart.id));
    }}><img src={heart.src} alt="" /></span>)}
  </>;
}
export function ValentinesLogo() {
  return <img className={styles.logo} src={loveLetter} alt="" />;
}
