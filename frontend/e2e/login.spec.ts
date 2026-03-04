import { test, expect } from "@playwright/test";

test.describe("Login Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login");
  });

  test("renders login form elements", async ({ page }) => {
    await expect(page.getByText("Bem-vindo de volta")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Entrar com Google" })
    ).toBeVisible();
  });

  test("shows validation errors on empty submit", async ({ page }) => {
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(page.getByText("E-mail é obrigatório")).toBeVisible();
    await expect(page.getByText("Senha é obrigatória")).toBeVisible();
  });

  test("shows email validation error for invalid email", async ({ page }) => {
    await page.getByLabel("E-mail").pressSequentially("notvalid");
    await page.getByLabel("Senha").fill("password123");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(page.getByText("E-mail inválido")).toBeVisible();
  });

  test("switches to magic link mode", async ({ page }) => {
    await page.getByText("Entrar com link mágico").click();

    await expect(page.getByLabel("Senha")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enviar link mágico" })
    ).toBeVisible();
  });

  test("switches back to password mode", async ({ page }) => {
    await page.getByText("Entrar com link mágico").click();
    await page.getByText("Entrar com senha").click();

    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  });

  test("preserves email when toggling modes", async ({ page }) => {
    await page.getByLabel("E-mail").fill("test@example.com");
    await page.getByText("Entrar com link mágico").click();

    await expect(page.getByLabel("E-mail")).toHaveValue("test@example.com");

    await page.getByText("Entrar com senha").click();

    await expect(page.getByLabel("E-mail")).toHaveValue("test@example.com");
  });

  test("magic link mode shows validation on empty submit", async ({
    page,
  }) => {
    await page.getByText("Entrar com link mágico").click();
    await page.getByRole("button", { name: "Enviar link mágico" }).click();

    await expect(page.getByText("E-mail é obrigatório")).toBeVisible();
  });

  test("register link navigates to /auth/register", async ({ page }) => {
    const link = page.getByRole("link", { name: "Criar conta" });
    await expect(link).toHaveAttribute("href", "/auth/register");
  });

  test("email input has correct autocomplete", async ({ page }) => {
    await expect(page.getByLabel("E-mail")).toHaveAttribute(
      "autocomplete",
      "email"
    );
  });

  test("password input has correct autocomplete", async ({ page }) => {
    await expect(page.getByLabel("Senha")).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
  });

  test("theme toggle is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Alternar tema" })
    ).toBeVisible();
  });
});
