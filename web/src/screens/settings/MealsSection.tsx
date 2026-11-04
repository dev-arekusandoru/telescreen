import { ForkKnife, PlugsConnected } from "@phosphor-icons/react";
import { useMealsStatus, useTestPantryPal } from "@/features/meals";
import { useSettings, useUpdateSettings } from "@/features/queries";
import { errorMessage } from "@/api/errors";
import { Switch, useToast } from "@/ui";
import styles from "./MealsSection.module.css";

/**
 * Settings > Modules > Meals: enable the module and inspect the PantryPal connection.
 * The URL comes from the server environment, so it is displayed read-only.
 */
export function MealsSection() {
  const { data: settings } = useSettings();
  const { data: status } = useMealsStatus();
  const update = useUpdateSettings();
  const test = useTestPantryPal();
  const toast = useToast();

  const enabled = settings?.modules.meals ?? false;
  const configured = status?.configured === true;

  const runTest = () =>
    test.mutate(undefined, {
      onSuccess: (result) => toast({ message: result.message }),
      onError: (error) => toast({ message: errorMessage(error) }),
    });

  return (
    <section className={styles.sec}>
      <h2>Meals</h2>

      <div className={styles.row}>
        <ForkKnife aria-hidden />
        <div>
          <b>PantryPal meals</b>
          <small>Tonight's dinner card and the Meals tab</small>
        </div>
        <div className={styles.end}>
          <Switch
            label="Meals"
            checked={enabled}
            disabled={!settings || update.isPending}
            onCheckedChange={(on) => settings && update.mutate({ modules: { ...settings.modules, meals: on } })}
          />
        </div>
      </div>

      <div className={styles.row}>
        <PlugsConnected aria-hidden />
        <div className={styles.statusText}>
          <b>PantryPal server</b>
          {configured ? (
            <>
              <small className={styles.url}>{status?.url}</small>
              <small>Recipe links open {status?.publicUrl}</small>
              <small>
                {status?.tokenConfigured
                  ? "Using the PANTRYPAL_TOKEN from the environment"
                  : "No token sent (PantryPal must run with PANTRYPAL_TRUST_NETWORK=1)"}
              </small>
            </>
          ) : (
            <small>Not configured. Set PANTRYPAL_URL in the environment and restart HomeHub.</small>
          )}
        </div>
        <div className={styles.end}>
          <button
            type="button"
            className={styles.btn}
            disabled={!configured || test.isPending}
            onClick={runTest}
          >
            {test.isPending ? "Testing…" : "Test connection"}
          </button>
        </div>
      </div>
    </section>
  );
}
