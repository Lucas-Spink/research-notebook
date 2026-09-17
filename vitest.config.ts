import { defineConfig } from "vitest/config";

const ignore = ["**/node_modules/**", "**/dist/**", "**/target/**"];

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "packages/**/*.test.ts",
            "extensions/vscode/src/**/*.test.ts",
          ],
          exclude: [
            ...ignore,
            "**/*.property.test.ts",
            "**/*.golden.test.ts",
            "**/*.fixtures.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["apps/desktop/src/**/*.test.{ts,tsx}"],
          exclude: [...ignore, "**/*.property.test.ts", "**/*.golden.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "property",
          environment: "node",
          include: ["**/*.property.test.ts"],
          exclude: ignore,
          testTimeout: 600_000,
        },
      },
      {
        extends: true,
        test: {
          name: "golden",
          environment: "node",
          include: ["**/*.golden.test.ts"],
          exclude: ignore,
        },
      },
      {
        extends: true,
        test: {
          name: "fixtures",
          environment: "node",
          include: ["**/*.fixtures.test.ts"],
          exclude: ignore,
        },
      },
    ],
  },
});
