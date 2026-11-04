import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom does not implement scrolling; the router's scroll restoration calls it.
window.scrollTo = () => {};

// jsdom lacks ResizeObserver (FullCalendar and Radix use it).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
