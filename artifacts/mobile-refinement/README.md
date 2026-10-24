# UI verification

Steel Browser, 390 × 844 and 375 × 812 mobile, 1440 × 1000 desktop.

The Saved runs and interaction screenshots use the actual app components with synthetic recordings in an isolated local browser harness. Its navigation/auth adapters live outside the repository; no authenticated backend, database writes, or hardware commands were used. The temporary Next development preview route was removed before the final production build.

- Replay: play/pause, keyboard seeking to both endpoints, coordinate-only recordings, snapshot handling, run comparison and Brush.
- Navigation: collapsed sidebar, mobile drawer, Guide contents Sheet, visible language/theme controls, ID/EN switching.
- Picking: axis position stays fixed while dragging in pick mode.
- Exports: actual Settings controls produced PNG, JPEG and ZIP; images contain the WebGL robot, current fonts/theme, legend, coordinates and timeline.
- ZIP: four PNGs, 401 raw joint samples, 101 independent trajectory points and run metadata. No live-monitor data substituted for Saved runs.
- Final production build and TypeScript passed; 18 replay/downsampling/alignment regression tests passed. Scoped ESLint passed.

Persisted trajectory points have sequence numbers but no timestamps. Replay uses recorded joint timestamps and estimates trajectory timing independently, as explained by the replay information control. Coordinate-only recordings use shared 100/70 mm robot geometry.

Screenshots: `saved-runs-light.png`, `saved-runs-dark.png`, `saved-runs-mobile.png`, `guide-mobile.png`, `guide-mobile-id.png`, `monitor-mobile.png`, `navigation-mobile.png`, `comparison.png`.

Export samples: `workspace-light.png`, `workspace-dark.png`, `workspace-light.jpg`, `saved-runs.zip`.

Detailed browser assertions are in the verification JSON files. A Steel session expired after the final picking assertion; completed assertions were retained and final screenshots were captured in a renewed session.

Production Results was also checked in Steel: signed-out visitors reached `/login` with the callback preserved and without result content. The forwarded production login flow emitted React hydration recovery warning #418; the isolated component interaction tests did not emit page errors.
