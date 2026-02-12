#!/usr/bin/env node

const lines = [
  "easy-e2e command guide",
  "",
  "Most common commands",
  "  npm run help                     Show this guide",
  "  npx easy-e2e setup              First-run setup (config + Chromium)",
  "  npx easy-e2e play               Run YAML browser tests",
  "  npx easy-e2e record             Record a new YAML test",
  "  npx easy-e2e list               List discovered YAML tests",
  "",
  "If app already running",
  "  npx easy-e2e play --no-start    Skip auto-start and run against running app",
  "",
  "Development/Maintainer",
  "  npm test                        Framework test suite (Vitest)",
  "  npm run test:framework          Same as npm test",
  "  npm run test:smoke              Consumer smoke flow (setup -> play)",
  "  npm run test:unit               Unit tests only",
  "  npm run test:integration        Integration tests only",
  "  npm run test:coverage           Coverage run",
  "",
  "More help",
  "  npx easy-e2e --help",
  "  npx easy-e2e play --help",
];

process.stdout.write(`${lines.join("\n")}\n`);
