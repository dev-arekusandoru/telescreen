import * as Dialog from "@radix-ui/react-dialog";
import { AppleLogo, ArrowsClockwise, GoogleLogo, Plus, Trash, Warning, X, type Icon } from "@phosphor-icons/react";
import { useState } from "react";
import { useAccounts, useRemoveAccount, useStartGoogle, useSyncAccount, type Account } from "@/features/accounts";
import { useCalendars } from "@/features/calendar";
import { cx } from "@/ui";
import { AddIcloudDialog } from "./AddIcloudDialog";
import styles from "./Accounts.module.css";
import settings from "./Settings.module.css";

const PROVIDERS: Record<Account["provider"], { label: string; icon: Icon }> = {
  icloud: { label: "iCloud", icon: AppleLogo },
  google: { label: "Google", icon: GoogleLogo },
};

const STATUS: Record<Account["status"], { label: string; warn: boolean }> = {
  ok: { label: "Connected", warn: false },
  error: { label: "Sync problem", warn: true },
  needs_auth: { label: "Reconnect needed", warn: true },
};

function RemoveDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const remove = useRemoveAccount();
  return (
    <Dialog.Root open={account !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.scrim} />
        <Dialog.Content className={styles.sheet}>
          <Dialog.Title className={styles.heading}>Remove {account?.label}?</Dialog.Title>
          <Dialog.Close className={styles.close} aria-label="Close">
            <X aria-hidden />
          </Dialog.Close>
          <Dialog.Description className={styles.desc}>
            Telescreen forgets this account and its cached events. Nothing is deleted from {account ? PROVIDERS[account.provider].label : "the provider"}.
          </Dialog.Description>
          {remove.error ? (
            <p className={styles.error} role="alert">
              {remove.error.message}
            </p>
          ) : null}
          <div className={styles.footer}>
            <Dialog.Close className={styles.ghost} type="button">
              Keep
            </Dialog.Close>
            <button
              type="button"
              className={styles.dangerBtn}
              disabled={remove.isPending}
              onClick={() => account && remove.mutate(account.id, { onSuccess: onClose })}
            >
              Remove
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AccountRow({ account, calendarCount, onRemove }: { account: Account; calendarCount: number; onRemove: () => void }) {
  const sync = useSyncAccount();
  const google = useStartGoogle();
  const provider = PROVIDERS[account.provider];
  const status = STATUS[account.status];
  const ProviderIcon = provider.icon;
  const reconnectGoogle = account.provider === "google" && account.status === "needs_auth";

  return (
    <div className={settings.row}>
      <ProviderIcon aria-hidden />
      <div className={styles.main}>
        <b>{account.label}</b>
        <small>
          {provider.label} · {calendarCount} {calendarCount === 1 ? "calendar" : "calendars"}
        </small>
        {account.lastError ? (
          <small className={styles.warn} role="status">
            <Warning aria-hidden />
            <span>{account.lastError}</span>
          </small>
        ) : null}
      </div>
      <span className={cx(styles.badge, status.warn && styles.badgeWarn)}>{status.label}</span>
      <div className={styles.actions}>
        {reconnectGoogle ? (
          <button
            type="button"
            className={styles.ghost}
            disabled={google.isPending}
            onClick={() => google.mutate(undefined, { onSuccess: (url) => window.location.assign(url) })}
          >
            Reconnect
          </button>
        ) : null}
        <button
          type="button"
          className={cx(settings.iconBtn, sync.isPending && styles.spin)}
          aria-label={`Sync ${account.label} now`}
          disabled={sync.isPending}
          onClick={() => sync.mutate(account.id)}
        >
          <ArrowsClockwise aria-hidden />
        </button>
        <button type="button" className={settings.iconBtn} aria-label={`Remove ${account.label}`} onClick={onRemove}>
          <Trash aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Settings > Accounts: connected providers with status, sync-now and remove; add iCloud or Google. */
export function AccountsSection() {
  const { data: accounts = [] } = useAccounts();
  const { data: calendars = [] } = useCalendars();
  const google = useStartGoogle();
  const [icloudOpen, setIcloudOpen] = useState(false);
  const [removing, setRemoving] = useState<Account | null>(null);

  return (
    <section className={settings.sec} aria-labelledby="accounts-h">
      <h2 id="accounts-h">Accounts</h2>
      {accounts.length === 0 ? <p className={styles.hint}>No calendars connected yet. Add iCloud or Google to see events.</p> : null}
      {accounts.map((a) => (
        <AccountRow
          key={a.id}
          account={a}
          calendarCount={calendars.filter((c) => c.accountId === a.id).length}
          onRemove={() => setRemoving(a)}
        />
      ))}
      <div className={styles.addRow}>
        <button type="button" className={styles.ghost} onClick={() => setIcloudOpen(true)}>
          <Plus aria-hidden /> Add iCloud
        </button>
        <button
          type="button"
          className={styles.ghost}
          disabled={google.isPending}
          onClick={() => google.mutate(undefined, { onSuccess: (url) => window.location.assign(url) })}
        >
          <Plus aria-hidden /> Add Google
        </button>
      </div>
      {google.error ? (
        <p className={styles.error} role="alert">
          {google.error.message}
        </p>
      ) : null}
      <AddIcloudDialog open={icloudOpen} onOpenChange={setIcloudOpen} />
      <RemoveDialog account={removing} onClose={() => setRemoving(null)} />
    </section>
  );
}
