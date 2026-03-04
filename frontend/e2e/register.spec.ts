import { test, expect } from "@playwright/test";

test.describe("Register Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/register");
  });

  test("renders register form elements", async ({ page }) => {
    await expect(page.getByText("Criar conta", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Nome")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByLabel("Confirmar senha")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Criar conta" })
    ).toBeVisible();
  });

  test("shows validation errors on empty submit", async ({ page }) => {
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.getByText("Nome é obrigatório")).toBeVisible();
    await expect(page.getByText("E-mail é obrigatório")).toBeVisible();
    await expect(page.getByText("Mínimo de 8 caracteres")).toBeVisible();
    await expect(page.getByText("Confirme sua senha")).toBeVisible();
  });

  test("shows email validation error for invalid email", async ({ page }) => {
    await page.getByLabel("Nome").fill("Alice");
    await page.getByLabel("E-mail").pressSequentially("notvalid");
    await page.getByLabel("Senha").fill("password123");
    await page.getByLabel("Confirmar senha").fill("password123");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.getByText("E-mail inválido")).toBeVisible();
  });

  test("shows error for short password", async ({ page }) => {
    await page.getByLabel("Nome").fill("Alice");
    await page.getByLabel("E-mail").fill("alice@example.com");
    await page.getByLabel("Senha").fill("short");
    await page.getByLabel("Confirmar senha").fill("short");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.getByText("Mínimo de 8 caracteres")).toBeVisible();
  });

  test("shows error when passwords do not match", async ({ page }) => {
    await page.getByLabel("Nome").fill("Alice");
    await page.getByLabel("E-mail").fill("alice@example.com");
    await page.getByLabel("Senha").fill("password123");
    await page.getByLabel("Confirmar senha").fill("different123");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.getByText("As senhas não coincidem")).toBeVisible();
  });

  test("toggles password visibility", async ({ page }) => {
    const passwordInput = page.getByLabel("Senha");
    await expect(passwordInput).toHaveAttribute("type", "password");

    await page.getByLabel("Mostrar senha").click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    await page.getByLabel("Ocultar senha").click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("toggles confirm password visibility", async ({ page }) => {
    const confirmInput = page.getByLabel("Confirmar senha");
    await expect(confirmInput).toHaveAttribute("type", "password");

    await page.getByLabel("Mostrar confirmação de senha").click();
    await expect(confirmInput).toHaveAttribute("type", "text");

    await page.getByLabel("Ocultar confirmação de senha").click();
    await expect(confirmInput).toHaveAttribute("type", "password");
  });

  test("login link navigates to /auth/login", async ({ page }) => {
    const link = page.getByRole("link", { name: "Entrar" });
    await expect(link).toHaveAttribute("href", "/auth/login");
  });

  test("name input has correct autocomplete", async ({ page }) => {
    await expect(page.getByLabel("Nome")).toHaveAttribute(
      "autocomplete",
      "name"
    );
  });

  test("email input has correct autocomplete", async ({ page }) => {
    await expect(page.getByLabel("E-mail")).toHaveAttribute(
      "autocomplete",
      "email"
    );
  });

  test("password inputs have correct autocomplete", async ({ page }) => {
    await expect(page.getByLabel("Senha")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
    await expect(page.getByLabel("Confirmar senha")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
  });

  test("theme toggle is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Alternar tema" })
    ).toBeVisible();
  });
});
