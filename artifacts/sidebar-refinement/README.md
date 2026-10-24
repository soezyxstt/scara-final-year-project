# Sidebar and interaction refinement

The custom sidebar was replaced with the official shadcn/ui Sidebar source, adapted to the console's existing Radix primitives and theme tokens. The source URL is recorded in `hmi/components/ui/sidebar.tsx`.

Changes:
- Neutral surfaces, tighter navigation groups, consistent icons, and a compact header.
- A visible toggle beside the page title at every desktop width.
- Animated 224px expanded and 56px collapsed states, collapsed tooltips, Ctrl/Cmd+B, and cookie persistence across reloads.
- A shadcn Sheet drawer on mobile, with Escape/outside dismissal and focus restoration.
- shadcn Tabs with arrow-key navigation, animated active indicators, and short panel transitions.
- Reduced-motion support and a compact mobile emergency-stop label.

Screenshots use Steel Browser with 401 synthetic telemetry samples. `expanded.png` and `collapsed.png` show the desktop states; `mobile-drawer.png` shows the mobile drawer. `verification.json` records the completed browser checks.

Production build, TypeScript, scoped lint, and all 12 Steel checks passed, with no uncaught browser errors. Robot assets, kinematics, coordinate calculations, and firmware commands were preserved. No hardware commands or database writes were executed. Steel logs embedded GLTF texture warnings; the three existing model files and geometry render.
