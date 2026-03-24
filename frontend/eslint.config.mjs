import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Bloqueia dangerouslySetInnerHTML sem sanitizador — prevenção XSS
      // Todo conteúdo rico de usuário deve passar por DOMPurify antes de ser renderizado.
      "react/no-danger": "error",
    },
  },
];

export default eslintConfig;
