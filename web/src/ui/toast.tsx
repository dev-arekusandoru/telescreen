import * as RadixToast from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import styles from "./toast.module.css";

export interface ToastOptions {
  message: string;
  /** Optional pill button on the right ("Undo", "Retry"). Tapping it also dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds before auto-dismiss (default 6000; chores undo uses 10000). */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

type ShowToast = (options: ToastOptions) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** `const toast = useToast(); toast({ message: "Saved", action: { label: "Undo", onClick } })`. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

let nextId = 1;

/** Radix Toast provider + viewport (bottom center). Mounted once in the Shell. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback<ShowToast>((options) => {
    setItems((prev) => [...prev, { ...options, id: nextId++ }]);
  }, []);
  const remove = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="down" duration={6000}>
        {children}
        {items.map((t) => (
          <RadixToast.Root
            key={t.id}
            className={styles.toast}
            duration={t.duration}
            onOpenChange={(open) => {
              if (!open) remove(t.id);
            }}
          >
            <RadixToast.Description className={styles.msg}>{t.message}</RadixToast.Description>
            {t.action ? (
              <RadixToast.Action
                altText={t.action.label}
                className={styles.action}
                onClick={t.action.onClick}
              >
                {t.action.label}
              </RadixToast.Action>
            ) : null}
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className={styles.viewport} />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
