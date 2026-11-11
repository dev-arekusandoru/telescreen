import { useEffect, useRef, useState } from "react";
import styles from "./newyear.module.css";
import type { ThemeProps } from "../types";

type Piece = { id: number; x: number; delay: number; duration: number; size: number; hue: number; kind: number; landed?: boolean };
const makePiece = (id: number): Piece => ({
  id,
  x: 2 + Math.random() * 96,
  delay: Math.random() * 1.5,
  duration: 6 + Math.random() * 3,
  size: 8 + Math.random() * 7,
  hue: [43, 210, 220, 340][Math.floor(Math.random() * 4)] ?? 43,
  kind: Math.floor(Math.random() * 3),
});
const initial = () => Array.from({ length: 22 }, (_, i) => makePiece(i));

export function NewYear({ syncedAt }: ThemeProps) {
  const [pieces, setPieces] = useState<Piece[]>(initial);
  const [burst, setBurst] = useState(0);
  const [spark, setSpark] = useState(0);
  const nextId = useRef(22);
  const lastSync = useRef(syncedAt);

  useEffect(() => {
    const spawn = window.setInterval(() => {
      setPieces((current) => current.length >= 150 ? current : [...current, makePiece(nextId.current++)]);
    }, 600);
    const pop = window.setInterval(() => setSpark((value) => value + 1), 4200);
    return () => { window.clearInterval(spawn); window.clearInterval(pop); };
  }, []);

  useEffect(() => {
    if (lastSync.current === syncedAt) return;
    lastSync.current = syncedAt;
    setPieces(Array.from({ length: 30 }, (_, i) => makePiece(nextId.current++)));
    setBurst((value) => value + 1);
  }, [syncedAt]);

  const land = (id: number) => setPieces((current) => current.map((piece) => piece.id === id ? { ...piece, landed: true } : piece));

  return (
    <>
      <div className={styles.lights} aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: `${i * 5.8}%`, animationDelay: `${(i % 6) * 0.31}s` }} />)}</div>
      <div className={styles.balloons} aria-hidden="true"><i /><i /><i /></div>
      {pieces.map((piece) => <i key={piece.id} aria-hidden="true" className={`${styles.piece} ${styles[`kind${piece.kind}`]} ${piece.landed ? styles.landed : ""}`} style={{ left: `${piece.x}%`, width: piece.size, height: piece.kind === 2 ? piece.size * 1.8 : piece.size, animationDelay: piece.landed ? "0s" : `${piece.delay}s`, animationDuration: `${piece.duration}s`, color: `hsl(${piece.hue} 75% 38%)`, bottom: piece.landed ? `calc(var(--floor) + ${(piece.id * 7) % 12}px)` : undefined }} onAnimationEnd={() => { if (!piece.landed) land(piece.id); }} />)}
      <div key={spark} className={styles.pop} style={{ left: `${16 + (spark * 37) % 68}%` }} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <div key={burst} className={styles.burst} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
    </>
  );
}

