import "@testing-library/jest-dom/vitest";

// jsdom não implementa ResizeObserver, exigido pelos primitivos do Radix
// (Popover, Select) ao medirem trigger e seta.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Pre-set CSRF cookie so ensureCsrf() returns early in tests
// without making an extra fetch to /api/v1/auth/csrf.
document.cookie = "csrf_token=test_csrf_token";
