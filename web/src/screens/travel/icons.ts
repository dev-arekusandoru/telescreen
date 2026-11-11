import { Airplane, Barbell, Briefcase, GraduationCap, House, MapPin, ShoppingCart, type Icon } from "@phosphor-icons/react";
import type { TravelDestination } from "@/features/travel";

export type TravelIcon = TravelDestination["icon"];

/** One glyph per server-side icon key; shared by the card and the Settings picker. */
export const TRAVEL_ICONS: Record<TravelIcon, { label: string; Icon: Icon }> = {
  pin: { label: "Pin", Icon: MapPin },
  home: { label: "Home", Icon: House },
  work: { label: "Work", Icon: Briefcase },
  school: { label: "School", Icon: GraduationCap },
  shop: { label: "Shop", Icon: ShoppingCart },
  airport: { label: "Airport", Icon: Airplane },
  gym: { label: "Gym", Icon: Barbell },
};
