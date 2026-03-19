import "@testing-library/jest-dom/vitest";

// Pre-set CSRF cookie so ensureCsrf() returns early in tests
// without making an extra fetch to /api/v1/auth/csrf.
document.cookie = "csrf_token=test_csrf_token";
