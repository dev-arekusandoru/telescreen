import { useSettings } from "@/features/queries";
import { TonightCard } from "@/screens/meals/TonightCard";
import { NowPlayingBody } from "@/screens/music/NowPlayingCard";
import { TravelCard } from "@/screens/travel/TravelCard";
import { WeatherCard } from "@/screens/weather/WeatherCard";
import styles from "./WidgetColumn.module.css";

/**
 * The right-column widgets in order (SPEC §8): weather, travel, tonight, now playing.
 * Rendered by the Shell aside (>= 1280px) and by the small-screen widgets popup.
 * `includeWeather` is false while the header weather chip carries that widget instead,
 * so the same weather UI never appears twice.
 */
export function WidgetColumn({ includeWeather = true }: { includeWeather?: boolean }) {
  const { data: settings } = useSettings();
  const modules = settings?.modules;

  return (
    <>
      {includeWeather && modules?.weather ? <WeatherCard /> : null}
      {modules?.travel ? <TravelCard /> : null}
      {modules?.meals ? (
        <section className={styles.card} aria-label="Tonight">
          <TonightCard />
        </section>
      ) : null}
      {modules?.music ? <NowPlayingBody /> : null}
    </>
  );
}
