export const config = {
  runner: "local",
  specs: ["./specs/**/*.spec.js"],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: process.env.KOKLO_TAURI_E2E_BINARY,
      },
    },
  ],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 120_000,
  },
  reporters: ["spec"],
  services: [
    [
      "tauri",
      {
        appBinaryPath: process.env.KOKLO_TAURI_E2E_BINARY,
        captureBackendLogs: true,
        driverProvider: "embedded",
      },
    ],
  ],
  waitforTimeout: 20_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
};
