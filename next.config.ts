import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // The dev-mode route indicator (bottom-left "Rendering..."/build-status
  // pill) was leaking into Playwright's visual baselines -- three Concept
  // Atlas darwin PNGs changed in this branch for no reason connected to
  // any code path this branch touched, purely because the indicator's
  // state differed between captures. `devIndicators: false` (confirmed
  // supported in this project's Next 16.3.4 via
  // node_modules/next/dist/docs/01-app/.../devIndicators.md) removes it
  // from dev-mode rendering entirely, which is what the visual suite
  // renders against -- still surfaces real compile/runtime errors per
  // Next's own docs, just not the always-present route-status pill.
  devIndicators: false,
};

export default nextConfig;
