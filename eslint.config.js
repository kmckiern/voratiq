import globals from "globals";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import eslintPluginJest from "eslint-plugin-jest";
import eslintJs from "@eslint/js";

const tsRecommended = tseslint.configs["recommended-type-checked"];
const jestRecommended =
  eslintPluginJest.configs["flat/recommended"] ??
  eslintPluginJest.configs.recommended;

/**
 * @param {{ files: string[]; project: string; includeJest: boolean }} options
 */
const createTsConfig = ({ files, project, includeJest }) => ({
  files,
  ignores: ["dist/**", "node_modules/**"],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      project,
      tsconfigRootDir: import.meta.dirname,
    },
    globals: {
      ...globals.nodeBuiltin,
      ...(includeJest ? globals.jest : {}),
    },
  },
  plugins: {
    "@typescript-eslint": tseslint,
    ...(includeJest ? { jest: eslintPluginJest } : {}),
  },
  rules: {
    ...eslintJs.configs.recommended.rules,
    ...(tsRecommended?.rules ?? {}),
    ...(includeJest && jestRecommended ? jestRecommended.rules : {}),
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-floating-promises": "error",
    ...(includeJest
      ? {
          "jest/no-disabled-tests": "warn",
          "jest/no-focused-tests": "error",
        }
      : {}),
  },
});

export default [
  createTsConfig({
    files: ["src/**/*.ts"],
    project: "./tsconfig.json",
    includeJest: false,
  }),
  createTsConfig({
    files: ["tests/**/*.ts"],
    project: "./tsconfig.jest.json",
    includeJest: true,
  }),
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    ignores: ["dist/**", "node_modules/**"],
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
    rules: {
      ...eslintJs.configs.recommended.rules,
    },
  },
  {
    files: ["jest.config.js"],
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
    rules: {
      ...eslintJs.configs.recommended.rules,
    },
    settings: {
      jest: {
        version: 30,
      },
    },
  },
];
