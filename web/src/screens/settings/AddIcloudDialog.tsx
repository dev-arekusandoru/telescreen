import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { useId, useState, type FormEvent } from "react";
import { useAddIcloudAccount } from "@/features/accounts";
import settings from "./Settings.module.css";
import styles from "./Accounts.module.css";

/** Apple ID + app-specific password (iCloud has no OAuth for CalDAV). */
export function AddIcloudDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ids = { label: useId(), apple: useId(), pass: useId() };
  const add = useAddIcloudAccount();
  const [label, setLabel] = useState("iCloud");
  const [appleId, setAppleId] = useState("");
  const [appPassword, setAppPassword] = useState("");

  const reset = () => {
    setLabel("iCloud");
    setAppleId("");
    setAppPassword("");
    add.reset();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(
      { label: label.trim(), appleId: appleId.trim(), appPassword: appPassword.trim() },
      {
        onSuccess: () => {
          onOpenChange(false);
          reset();
        },
      },
    );
  };

  const ready = label.trim() !== "" && appleId.trim() !== "" && appPassword.trim() !== "";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.scrim} />
        <Dialog.Content className={styles.sheet}>
          <Dialog.Title className={styles.heading}>Add iCloud</Dialog.Title>
          <Dialog.Close className={styles.close} aria-label="Close">
            <X aria-hidden />
          </Dialog.Close>
          <Dialog.Description className={styles.desc}>
            Create an app-specific password at appleid.apple.com (Sign-In and Security) and paste it here. Your Apple ID
            password does not work, and HomeHub stores the app password encrypted on this server only.
          </Dialog.Description>
          <form onSubmit={submit}>
            <div className={styles.fld}>
              <label htmlFor={ids.label}>Name</label>
              <input id={ids.label} value={label} onChange={(e) => setLabel(e.target.value)} autoComplete="off" />
            </div>
            <div className={styles.fld}>
              <label htmlFor={ids.apple}>Apple ID</label>
              <input
                id={ids.apple}
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                value={appleId}
                onChange={(e) => setAppleId(e.target.value)}
              />
            </div>
            <div className={styles.fld}>
              <label htmlFor={ids.pass}>App-specific password</label>
              <input
                id={ids.pass}
                type="password"
                autoComplete="off"
                placeholder="xxxx-xxxx-xxxx-xxxx"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
              />
            </div>
            {add.error ? (
              <p className={styles.error} role="alert">
                {add.error.message}
              </p>
            ) : null}
            <div className={styles.footer}>
              <Dialog.Close className={styles.ghost} type="button">
                Cancel
              </Dialog.Close>
              <button type="submit" className={settings.btn} disabled={!ready || add.isPending}>
                {add.isPending ? "Connecting…" : "Connect"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
