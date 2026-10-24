# Console layout redesign

The console now uses shared navigation and a shared controller toolbar across its pages.

- Persistent sidebar: Monitor, Analysis, Step response, Tuning, Test bench, Experiments, Results, Saved runs, Hardware, and Guide.
- Monitor: robot workspace above telemetry, with a separate inspector for controls or run metrics.
- Analysis: Motion, Controls, and Data views with URL-based navigation and browser history.
- Context tabs: test bench, PCB viewer, experiment selection, results, and saved-run views.
- Shared controls: connection, serial terminal, Run where applicable, emergency stop, settings, language, and theme.
- Responsive navigation rail and stacked panels on smaller screens.

Screenshots were captured in **Steel Browser** using 401 synthetic samples spanning 8 seconds. The trajectory runs from (90, 100) to (−70, 100) mm. `seed.json` contains the browser-local fixture; these are illustrative values, not experimental results.

- `monitor-light.png`: 1600 × 1000, controls inspector.
- `monitor-dark.png`: 1366 × 900, controls inspector with edited target coordinates.
- `analysis-light.png`: 1600 × 1000, Motion view.
- `verification.json`: browser checks and limitations.

Production build, TypeScript, and lint on the new shell and rewritten page-entry components passed. No hardware commands or database writes were executed. Protected experiment and saved-run routes still require authentication; only their unauthenticated redirects were exercised. OAuth completion and signed-in experiment execution were not tested. The live results database was unavailable in this environment; its offline/error state was exercised.

The existing GLB assets, kinematics, safety checks, and firmware protocol were preserved. Steel logs embedded-texture warnings from GLTFLoader; all three model files and their geometry render.
