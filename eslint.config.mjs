// Architecture boundaries here mirror .dependency-cruiser.cjs (spec 6.3) as a
// fast editor-level echo; pnpm deps:check is the authoritative enforcement.
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeCoreModules = [
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dns",
  "events",
  "fs",
  "fs/promises",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "repl",
  "stream",
  "timers",
  "tls",
  "url",
  "util",
  "vm",
  "worker_threads",
  "zlib",
];

const tauriPluginPattern = {
  group: [
    "@tauri-apps/plugin-fs",
    "@tauri-apps/plugin-fs/*",
    "@tauri-apps/plugin-shell",
    "@tauri-apps/plugin-shell/*",
    "@tauri-apps/plugin-http",
    "@tauri-apps/plugin-http/*",
  ],
  message:
    "The webview must not use filesystem, shell or HTTP plugins (spec 6.7).",
};

const yamlPattern = {
  group: ["yaml"],
  message:
    "Notebook files are parsed and serialised only by packages/format (AGENTS.md section 2 rule 2).",
};

export default defineConfig(
  globalIgnores([
    "**/dist/**",
    "**/target/**",
    "**/*.tsbuildinfo",
    "apps/desktop/src-tauri/gen/**",
    "fixtures/**",
  ]),

  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.eslintRecommended,
      tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vitest.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },

  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },

  {
    // packages/* must not depend on React, Tauri, apps/ or extensions/ (AGENTS.md §4).
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-dom",
                "@tauri-apps/*",
                "**/apps/*",
                "**/extensions/*",
              ],
              message:
                "packages/* must not depend on React, Tauri, apps/ or extensions/ (AGENTS.md section 4).",
            },
          ],
        },
      ],
    },
  },

  {
    // packages/format and packages/citations perform no I/O (AGENTS.md §4).
    files: ["packages/format/src/**/*.ts", "packages/citations/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: nodeCoreModules.map((name) => ({
            name,
            message:
              "packages/format and packages/citations must not perform I/O (AGENTS.md section 4).",
          })),
          patterns: [
            {
              group: ["node:*"],
              message:
                "packages/format and packages/citations must not perform I/O (AGENTS.md section 4).",
            },
          ],
        },
      ],
    },
  },

  {
    // The webview must not use filesystem, shell or HTTP plugins (spec 6.7).
    // Applies to apps/desktop/src/ipc/ too: generated bindings may call
    // invoke, but must not reach for these plugins either.
    files: ["apps/desktop/src/ipc/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [tauriPluginPattern, yamlPattern] },
      ],
    },
  },

  {
    // The webview must not use filesystem, shell or HTTP plugins (spec 6.7),
    // and only apps/desktop/src/ipc/ may call Tauri invoke directly
    // (AGENTS.md §4). Both restrictions are combined here because ESLint flat
    // config replaces, rather than merges, a rule's options when two matching
    // config objects both set it.
    files: ["apps/desktop/src/**/*.{ts,tsx}"],
    ignores: ["apps/desktop/src/ipc/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [tauriPluginPattern, yamlPattern],
          paths: [
            {
              name: "@tauri-apps/api/core",
              message:
                "Only apps/desktop/src/ipc/ may call Tauri invoke directly (AGENTS.md section 4).",
            },
          ],
        },
      ],
    },
  },

  {
    // extensions/vscode must not depend on apps/ (AGENTS.md §4).
    files: ["extensions/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/apps/*"],
              message:
                "extensions/vscode must not depend on apps/ (AGENTS.md section 4).",
            },
            yamlPattern,
          ],
        },
      ],
    },
  },
);
