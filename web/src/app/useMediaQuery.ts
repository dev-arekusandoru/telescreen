import { useEffect, useState } from "react";

/**
 * Live `matchMedia` result. SSR/jsdom without `matchMedia` reports `false`, so callers should
 * default to the narrow layout (the widget column is an enhancement).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => globalThis.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const media = globalThis.matchMedia?.(query);
    if (!media) return;
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}
