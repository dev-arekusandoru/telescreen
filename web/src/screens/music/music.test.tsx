import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings, renderAt, stubApi } from "@/test/api";

interface Track {
  id: string;
  title: string;
  artists: string[];
  album: string | null;
  albumArtUrl: string | null;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
}

interface Device {
  id: string | null;
  name: string;
  type: string;
  volumePercent: number | null;
  isActive: boolean;
}

const TRACK: Track = {
  id: "track-1",
  title: "Golden Hour",
  artists: ["JVKE"],
  album: "Golden Hour",
  albumArtUrl: "https://img.example/640.jpg",
  durationMs: 208_000,
  progressMs: 42_000,
  isPlaying: true,
};

const RECENT = [
  { uri: "spotify:album:a1", kind: "album", title: "Low Tide Letters", subtitle: "Marlowe", imageUrl: "https://img.example/a1.jpg" },
  { uri: "spotify:album:a2", kind: "album", title: "Neon Orchard", subtitle: "Citrus Hotel", imageUrl: null },
];
const PLAYLISTS = [
  { uri: "spotify:user:mara:collection", kind: "collection", title: "Liked Songs", subtitle: null, imageUrl: null },
  { uri: "spotify:playlist:p1", kind: "playlist", title: "Dinner Party", subtitle: "12 songs", imageUrl: null },
];

const KITCHEN: Device = { id: "dev-1", name: "Kitchen", type: "Speaker", volumePercent: 40, isActive: true };
const OFFICE: Device = { id: "dev-2", name: "Office", type: "Computer", volumePercent: 25, isActive: false };

let player: { track: Track | null; device: Device | null };
let connection: {
  connected: boolean;
  configured: boolean;
  label: string | null;
  status: "ok" | "error" | "needs_auth" | null;
  lastError: string | null;
};
let nowPlayingError: { status: number; body: unknown } | null;
let musicEnabled: boolean;
let libraryError: { status: number; body: unknown } | null;
let calls: Array<{ method: string; path: string; body: unknown }>;

const json = (data: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  localStorage.clear();
  stubApi();
  // Radix Select needs the pointer-capture API jsdom does not implement.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  const base = globalThis.fetch;
  player = { track: TRACK, device: KITCHEN };
  connection = { connected: true, configured: true, label: "Mara", status: "ok", lastError: null };
  nowPlayingError = null;
  musicEnabled = false;
  libraryError = null;
  calls = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const req = typeof input === "string" ? new Request(input, init) : input;
      const path = new URL(req.url).pathname.replace("/api/v1", "");
      const body = req.method === "GET" ? undefined : await req.clone().json().catch(() => undefined);
      if (path === "/settings" && req.method === "GET") {
        const settings = defaultSettings();
        return json({ ...settings, modules: { ...settings.modules, music: musicEnabled } });
      }
      if (path === "/music/connection" && req.method === "GET") return json(connection);
      if (path === "/music/now-playing") {
        if (nowPlayingError) return json(nowPlayingError.body, nowPlayingError.status);
        return json(player);
      }
      if ((path === "/music/recent" || path === "/music/playlists") && req.method === "GET") {
        if (libraryError) return json(libraryError.body, libraryError.status);
        return json({ items: path === "/music/recent" ? RECENT : PLAYLISTS });
      }
      if (path === "/music/devices" && req.method === "GET") return json({ devices: [KITCHEN, OFFICE] });
      if (path === "/music/connect/start") {
        calls.push({ method: req.method, path, body });
        // Same-document URL: jsdom implements hash navigation, so the test stays quiet.
        return json({ authUrl: "http://localhost/#spotify-authorized" });
      }
      if (path.startsWith("/music/")) {
        calls.push({ method: req.method, path, body });
        const pause = path === "/music/pause";
        const play = path === "/music/play";
        if ((pause || play) && player.track) {
          player = { ...player, track: { ...player.track, isPlaying: play } };
        }
        if (path === "/music/next" && player.track) {
          player = { ...player, track: { ...player.track, id: "track-2", title: "Next Song" } };
        }
        if (path === "/music/device" && body && typeof body === "object" && "deviceId" in body) {
          const target = body.deviceId === OFFICE.id ? OFFICE : KITCHEN;
          // Transferring starts playback: Spotify reports a track afterwards.
          player = { track: player.track ?? { ...TRACK, isPlaying: true }, device: { ...target, isActive: true } };
        }
        return json(null, 204);
      }
      return base(input, init);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** Render a route and return queries scoped to the page (the card lives outside <main>). */
async function renderMain(path: string) {
  renderAt(path);
  const main = await screen.findByRole("main");
  return within(main);
}

describe("Music tab", () => {
  it("shows the current track with art, artists and progress", async () => {
    const view = await renderMain("/music");
    expect(await view.findByText("Golden Hour")).toBeInTheDocument();
    expect(view.getByText("JVKE")).toBeInTheDocument();
    expect(view.getByRole("img", { name: /Golden Hour cover/ })).toHaveAttribute(
      "src",
      "https://img.example/640.jpg",
    );
    const progress = view.getByRole("progressbar", { name: "Track progress" });
    expect(progress).toHaveAttribute("aria-valuemax", "208000");
    expect(Number(progress.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(42_000);
    expect(view.getByRole("button", { name: "Previous track" })).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Next track" })).toBeInTheDocument();
  });

  it("pauses and resumes with optimistic controls", async () => {
    const view = await renderMain("/music");
    await userEvent.click(await view.findByRole("button", { name: "Pause" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/music/pause", body: undefined }));
    expect(await view.findByRole("button", { name: "Play" })).toBeInTheDocument();

    await userEvent.click(view.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/music/play", body: undefined }));
    expect(await view.findByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("flips play/pause optimistically before Spotify answers", async () => {
    const outer = globalThis.fetch;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request | string, init?: RequestInit) => {
        const req = typeof input === "string" ? new Request(input, init) : input;
        if (new URL(req.url).pathname === "/api/v1/music/pause") {
          calls.push({ method: "POST", path: "/music/pause", body: undefined });
          await gate;
          return json(null, 204);
        }
        return outer(input, init);
      }),
    );

    renderAt("/music");
    await userEvent.click(await screen.findByRole("button", { name: "Pause" }));
    // The optimistic cache update flips the control while the request is still in flight.
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
    release();
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/music/pause", body: undefined }));
  });

  it("skips forward and back", async () => {
    const view = await renderMain("/music");
    await userEvent.click(await view.findByRole("button", { name: "Next track" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/music/next", body: undefined }));
    expect(await view.findByText("Next Song")).toBeInTheDocument();

    await userEvent.click(view.getByRole("button", { name: "Previous track" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/music/previous", body: undefined }));
  });

  it("shows an empty hero when nothing is playing", async () => {
    player = { track: null, device: null };
    const view = await renderMain("/music");
    expect(await view.findByText("Nothing playing")).toBeInTheDocument();
    expect(view.queryByRole("progressbar")).toBeNull();
    expect(view.queryByRole("button", { name: "Pause" })).toBeNull();
  });

  it("keeps volume and device controls out of the page for now", async () => {
    const view = await renderMain("/music");
    await view.findByText("Golden Hour");
    expect(view.queryByRole("slider", { name: "Volume" })).toBeNull();
    expect(view.queryByRole("combobox", { name: "Spotify device" })).toBeNull();
  });
});

describe("Music tab library", () => {
  it("lists recent albums and playlists and plays one on tap", async () => {
    const view = await renderMain("/music");
    const recent = await view.findByRole("region", { name: "Recently played" });
    expect(await within(recent).findByText("Marlowe")).toBeInTheDocument();
    await userEvent.click(within(recent).getByRole("button", { name: "Play Low Tide Letters" }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "POST", path: "/music/play-context", body: { uri: "spotify:album:a1" } }),
    );
    const playlists = view.getByRole("region", { name: "Your playlists" });
    expect(within(playlists).getByRole("button", { name: "Play Liked Songs" })).toBeInTheDocument();
  });

  it("pins in edit mode instead of playing, then plays a pin with one tap", async () => {
    const view = await renderMain("/music");
    const pinned = await view.findByRole("region", { name: "Pinned" });
    expect(within(pinned).getByText(/Pin your go-to/)).toBeInTheDocument();

    await userEvent.click(within(pinned).getByRole("button", { name: "Edit" }));
    await userEvent.click(await view.findByRole("button", { name: "Pin Dinner Party" }));
    expect(calls.some((c) => c.path === "/music/play-context")).toBe(false);
    expect(await within(pinned).findByRole("button", { name: "Unpin Dinner Party" })).toBeInTheDocument();

    await userEvent.click(within(pinned).getByRole("button", { name: "Done" }));
    await userEvent.click(within(pinned).getByRole("button", { name: "Play Dinner Party" }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "POST", path: "/music/play-context", body: { uri: "spotify:playlist:p1" } }),
    );
  });

  it("asks to reconnect when the library scopes are missing", async () => {
    libraryError = {
      status: 422,
      body: { error: { code: "unprocessable", message: "scope", details: { reason: "missing_scope" } } },
    };
    const view = await renderMain("/music");
    expect(await view.findByText("Reconnect Spotify to browse your music")).toBeInTheDocument();
    expect(view.queryByRole("region", { name: "Recently played" })).toBeNull();
    // Playback is unaffected.
    expect(view.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });
});

describe("connection states", () => {
  it("asks to reconnect when Spotify rejected the stored token", async () => {
    nowPlayingError = {
      status: 422,
      body: { error: { code: "unprocessable", message: "Reconnect", details: { reason: "needs_reconnect" } } },
    };
    const view = await renderMain("/music");
    expect(await view.findByText(/needs reconnecting/i)).toBeInTheDocument();
    expect(view.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings");
  });

  it("points to Settings when Spotify is not connected", async () => {
    connection = { connected: false, configured: true, label: null, status: null, lastError: null };
    const view = await renderMain("/music");
    expect(await view.findByText(/not connected/i)).toBeInTheDocument();
    expect(view.getByRole("link", { name: "Connect in Settings" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Pause" })).toBeNull());
  });

  it("says Unavailable when the upstream is down", async () => {
    nowPlayingError = {
      status: 502,
      body: { error: { code: "provider_error", message: "Spotify request failed", details: { reason: "provider_error" } } },
    };
    const view = await renderMain("/music");
    expect(await view.findByText("Unavailable")).toBeInTheDocument();
    expect(view.queryByText("Nothing playing")).toBeNull();
  });
});

describe("right column widget", () => {
  const widget = async () => {
    musicEnabled = true;
    await renderMain("/calendar");
    const aside = await screen.findByRole("complementary", { name: "At a glance" });
    const card = await within(aside).findByRole("region", { name: "Now playing" });
    return { aside, card, view: within(card) };
  };

  it("shows only title and artist in standby", async () => {
    const { view } = await widget();
    expect(await view.findByText("Golden Hour")).toBeInTheDocument();
    expect(view.getByText("JVKE")).toBeInTheDocument();
    expect(view.queryByRole("slider")).toBeNull();
    expect(view.queryByRole("combobox")).toBeNull();
  });

  it("first tap reveals controls, a control acts, a second tap elsewhere opens Music", async () => {
    const { card, view } = await widget();
    await view.findByText("Golden Hour");
    fireEvent.click(card); // bare click = touch tap (no mouse hover)
    await userEvent.click(await view.findByRole("button", { name: "Pause", hidden: true }));
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/music/pause", body: undefined }));
    expect(within(screen.getByRole("main")).queryByRole("heading", { level: 1, name: "Music" })).toBeNull();

    fireEvent.click(card); // bare click = touch tap (no mouse hover)
    expect(await within(screen.getByRole("main")).findByRole("heading", { level: 1, name: "Music" })).toBeInTheDocument();
  });

  it("shows a friendly empty state and opens Music on tap", async () => {
    player = { track: null, device: null };
    const { card, view } = await widget();
    expect(await view.findByText("Nothing playing")).toBeInTheDocument();
    expect(view.queryByRole("progressbar")).toBeNull();
    fireEvent.click(card); // bare click = touch tap (no mouse hover)
    expect(await within(screen.getByRole("main")).findByRole("heading", { level: 1, name: "Music" })).toBeInTheDocument();
  });

  it("points to Settings when Spotify is not connected", async () => {
    connection = { connected: false, configured: true, label: null, status: null, lastError: null };
    const { card, view } = await widget();
    expect(await view.findByText("Connect Spotify")).toBeInTheDocument();
    fireEvent.click(card); // bare click = touch tap (no mouse hover)
    expect(await screen.findByRole("button", { name: /^Music/ })).toBeInTheDocument();
  });
});

describe("Settings > Music", () => {
  it("connects Spotify through the OAuth start endpoint", async () => {
    connection = { connected: false, configured: true, label: null, status: null, lastError: null };
    renderAt("/settings");
    await userEvent.click(await screen.findByRole("button", { name: /^Music/ }));
    const section = await screen.findByRole("region", { name: "Music" });
    expect(within(section).getAllByText(/Not connected/i).length).toBeGreaterThan(0);
    await userEvent.click(within(section).getByRole("button", { name: /Connect Spotify/ }));
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/music/connect/start", body: undefined }));
  });

  it("shows the connected account and disconnects after confirming", async () => {
    renderAt("/settings");
    await userEvent.click(await screen.findByRole("button", { name: /^Music/ }));
    const section = await screen.findByRole("region", { name: "Music" });
    expect(await within(section).findByText(/Connected/)).toBeInTheDocument();
    expect(within(section).getByText(/Mara/)).toBeInTheDocument();

    await userEvent.click(within(section).getByRole("button", { name: "Disconnect" }));
    await userEvent.click(within(section).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "DELETE", path: "/music/connection", body: undefined }));
  });

  it("disables connecting when the server has no client id", async () => {
    connection = { connected: false, configured: false, label: null, status: null, lastError: null };
    renderAt("/settings");
    await userEvent.click(await screen.findByRole("button", { name: /^Music/ }));
    const section = await screen.findByRole("region", { name: "Music" });
    expect(within(section).getByText(/SPOTIFY_CLIENT_ID/)).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: /Connect Spotify/ })).toBeDisabled();
  });
});
