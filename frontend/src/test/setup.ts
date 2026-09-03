import "@testing-library/jest-dom/vitest";

// jsdom lacks IntersectionObserver/ResizeObserver which some libraries touch;
// provide minimal stubs so component tests stay focused on behavior.
class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error test-global polyfill
window.IntersectionObserver ??= MockObserver;
// @ts-expect-error test-global polyfill
window.ResizeObserver ??= MockObserver;
