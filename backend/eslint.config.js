import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Apply base JS recommendations and browser globals first
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      globals: globals.browser
    }
  },
  // Apply TypeScript recommended rules
  ...tseslint.configs.recommended, // Spread the recommended config to merge its rules
  // Your custom rules (including overrides) should come *last*
  {
    files: ["**/*.{ts,mts,cts}"], // Apply TypeScript-specific rules only to TypeScript files
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "prefer-const": "off"
    }
  }
]);