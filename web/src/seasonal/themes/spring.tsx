import { useEffect, useState } from "react";
import butterfly from "../art/spring/1f98b.svg";
import bee from "../art/spring/1f41d.svg";
import blossom from "../art/spring/1f338.svg";
import daisy from "../art/spring/1f33c.svg";
import hibiscus from "../art/spring/1f33a.svg";
import hyacinth from "../art/spring/1fabb.svg";
import rose from "../art/spring/1f339.svg";
import sunflower from "../art/spring/1f33b.svg";
import tulip from "../art/spring/1f337.svg";
import styles from "./spring.module.css";
import type { ThemeProps } from "../types";

const FLOWERS = [tulip, blossom, daisy, sunflower, hibiscus, rose, hyacinth];
const PETALS = Array.from({ length: 7 }, (_, id) => id);
const BUGS = [butterfly, butterfly, bee];

export function Spring({ syncedAt }: ThemeProps) {
  const [garden, setGarden] = useState(0);
  useEffect(() => setGarden((n) => n + 1), [syncedAt]);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <>
      {FLOWERS.map((src, id) => (
        <span key={`${garden}-${id}`} className={styles.flower} style={{ "--x": `${4 + id * 14}%`, "--grow": `${id * 5.5}s`, "--sway": `${id % 2 ? 2.8 : 3.5}s` } as React.CSSProperties}>
          <i />
          <img src={src} alt="" />
        </span>
      ))}
      {!reducedMotion && <>
        {PETALS.map((id) => <i key={`${garden}-p${id}`} className={styles.petal} style={{ "--x": `${(id * 37 + garden * 19) % 100}%`, "--delay": `${id * -3.7}s`, "--duration": `${17 + id % 4 * 3}s` } as React.CSSProperties} />)}
        {BUGS.map((src, id) => <img key={`${garden}-b${id}`} className={`${styles.bug} ${id === 2 ? styles.bee : ""}`} src={src} alt="" style={{ "--delay": `${id * -13}s`, "--duration": `${28 + id * 7}s`, "--path": `${id * 31}px` } as React.CSSProperties} />)}
      </>}
    </>
  );
}
