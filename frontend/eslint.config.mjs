import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      // Bloqueia dangerouslySetInnerHTML sem sanitizador — prevenção XSS
      "react/no-danger": "error",
      // Desativado: regras experimentais do React Compiler com muitos falsos positivos
      "react-hooks/react-compiler": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      // Desativado: falsos positivos comuns em componentes anônimos/HOCs
      "react/display-name": "off",
    },
  },
];

export default eslintConfig;
