import { easterSunday, inRange } from "./dates";
import { Christmas } from "./themes/christmas";
import { Easter } from "./themes/easter";
import { Halloween } from "./themes/halloween";
import { July4 } from "./themes/july4";
import { NewYear } from "./themes/newyear";
import { Spring } from "./themes/spring";
import { StPatricks } from "./themes/stpatricks";
import { Summer } from "./themes/summer";
import { Thanksgiving } from "./themes/thanksgiving";
import { Valentines } from "./themes/valentines";
import type { ThemeDef } from "./types";

/**
 * Order is priority: the first active theme wins, so specific events sit above the broad
 * seasons they overlap. Keep THEMES.md in sync when changing dates.
 */
export const THEMES: readonly ThemeDef[] = [
  { id: "newyear", label: "New Year", active: (d) => inRange(d, [11, 31], [0, 1]), Component: NewYear },
  { id: "christmas", label: "Christmas", active: (d) => inRange(d, [11, 1], [11, 30]), Component: Christmas },
  { id: "valentines", label: "Valentine's Day", active: (d) => inRange(d, [1, 7], [1, 14]), Component: Valentines },
  { id: "stpatricks", label: "St. Patrick's Day", active: (d) => inRange(d, [2, 10], [2, 17]), Component: StPatricks },
  {
    id: "easter",
    label: "Easter",
    // The 7 days up to and including Easter Sunday.
    active: (d) => {
      const e = easterSunday(d.getFullYear());
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return day <= e.getTime() && day >= e.getTime() - 6 * 86_400_000;
    },
    Component: Easter,
  },
  { id: "spring", label: "Spring", active: (d) => inRange(d, [3, 1], [4, 31]), Component: Spring },
  { id: "july4", label: "4th of July", active: (d) => inRange(d, [6, 1], [6, 4]), Component: July4 },
  { id: "summer", label: "Summer", active: (d) => inRange(d, [5, 1], [7, 31]), Component: Summer },
  { id: "halloween", label: "Halloween", active: (d) => inRange(d, [9, 15], [9, 31]), Component: Halloween },
  { id: "thanksgiving", label: "Thanksgiving", active: (d) => inRange(d, [10, 1], [10, 30]), Component: Thanksgiving },
];

export const themeForDate = (d: Date) => THEMES.find((t) => t.active(d));
