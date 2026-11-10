import { useEffect, useRef, useState } from "react";
import flag from "../art/july4/flag.svg";
import styles from "./july4.module.css";
import type { ThemeProps } from "../types";

const BURST_COUNT = 10;
const bursts = [
  { x: 18, y: 24, delay: "0s" },
  { x: 48, y: 39, delay: "2.7s" },
  { x: 78, y: 20, delay: "5.1s" },
];

export function July4({ syncedAt }: ThemeProps) {
  const [finale, setFinale] = useState(0);
  const lastSync = useRef(syncedAt);
  useEffect(() => {
    if (lastSync.current !== syncedAt) {
      lastSync.current = syncedAt;
      setFinale((n) => n + 1);
    }
  }, [syncedAt]);

  return (
    <>
      {bursts.map((burst, index) => (
        <div key={index} className={styles.launch} style={{ "--x": `${burst.x}%`, "--y": `${burst.y}%`, "--delay": burst.delay } as React.CSSProperties}>
          <i className={styles.trail} />
          <div className={styles.explosion}>
            {Array.from({ length: BURST_COUNT }, (_, particle) => <i key={particle} />)}
          </div>
        </div>
      ))}
      {finale > 0 && <div key={finale} className={styles.finale}>
        {Array.from({ length: 3 }, (_, index) => <div key={index} className={styles.finalBurst} style={{ "--x": `${20 + index * 30}%`, "--y": `${25 + (index % 2) * 18}%`, "--delay": `${index * 180}ms` } as React.CSSProperties}>{Array.from({ length: BURST_COUNT }, (_, particle) => <i key={particle} />)}</div>)}
      </div>}
      <img src={flag} alt="" className={`${styles.flag} ${styles.flagLeft}`} />
      <img src={flag} alt="" className={`${styles.flag} ${styles.flagRight}`} />
      <div className={styles.sparkler} />
    </>
  );
}
