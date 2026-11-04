import { ForkKnife, MusicNotes } from "@phosphor-icons/react";
import { createRoute } from "@tanstack/react-router";
import { shellRoute } from "@/app/routes";
import { ComingSoon, PageHeader } from "@/ui";

/** Placeholders for optional modules (SPEC §6). Their nav tabs show only when the module flag is on. */
export const mealsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/meals",
  component: () => (
    <>
      <PageHeader title="Meals" />
      <ComingSoon icon={ForkKnife} title="Meals">
        This week's plan from PantryPal will show here.
      </ComingSoon>
    </>
  ),
});

export const musicRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/music",
  component: () => (
    <>
      <PageHeader title="Music" />
      <ComingSoon icon={MusicNotes} title="Music">
        Spotify now playing and controls will show here.
      </ComingSoon>
    </>
  ),
});
