import { createRoute } from "@tanstack/react-router";
import { shellRoute } from "@/app/routes";
import { MusicScreen } from "./MusicScreen";

export const musicRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/music",
  component: MusicScreen,
});
