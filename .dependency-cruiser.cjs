/** Architecture boundaries from spec section 6.3. Protected path. */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "ui-no-direct-system-plugins",
      comment:
        "The webview must not use filesystem, shell or HTTP plugins (spec 6.7).",
      severity: "error",
      from: { path: "^apps/desktop/src" },
      to: { path: "node_modules/@tauri-apps/plugin-(fs|shell|http)" },
    },
    {
      name: "invoke-only-in-ipc",
      comment:
        "Only generated bindings in apps/desktop/src/ipc may call Tauri invoke.",
      severity: "error",
      from: { path: "^apps/desktop/src", pathNot: "^apps/desktop/src/ipc/" },
      to: { path: "node_modules/@tauri-apps/api/core" },
    },
    {
      name: "packages-no-node-core",
      comment: "packages/format and packages/citations perform no I/O.",
      severity: "error",
      from: { path: "^packages/(format|citations)/src" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "packages-no-ui-or-tauri",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "node_modules/(react|react-dom|@tauri-apps)/" },
    },
    {
      name: "packages-not-depend-on-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^(apps|extensions)/" },
    },
    {
      name: "extension-not-depend-on-app",
      severity: "error",
      from: { path: "^extensions/" },
      to: { path: "^apps/" },
    },
    {
      name: "features-use-public-api-only",
      comment:
        "A feature may import another feature only through its index.ts.",
      severity: "error",
      from: { path: "^apps/desktop/src/features/([^/]+)/" },
      to: {
        path: "^apps/desktop/src/features/[^/]+/",
        pathNot: [
          "^apps/desktop/src/features/$1/",
          "^apps/desktop/src/features/[^/]+/index\\.tsx?$",
        ],
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(dist|target)/" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
