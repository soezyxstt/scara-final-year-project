const fs = require('fs');

const svgContent = fs.readFileSync('public/dynamics-logo.svg', 'utf-8');

const pathRegex = /<path\s+d="([^"]+)"\s+fill="([^"]+)"(?:\s+transform="([^"]+)")?\s*\/>/g;

let paths = [];
let match;
while ((match = pathRegex.exec(svgContent)) !== null) {
  paths.push({
    d: match[1],
    fill: match[2],
    transform: match[3] || ''
  });
}

// Adjust timings
// max index = 8
// pathLength delay = i * 0.08, duration = 0.6
// fill delay = 0.8 + i * 0.08, duration = 0.4
// Total animation time = 0.8 + 0.64 + 0.4 = 1.84s

const renderedPaths = paths.map((p, i) => {
  const transformProp = p.transform ? ` transform="${p.transform}"` : '';
  const delayDraw = (i * 0.08).toFixed(2);
  const delayFill = (0.8 + i * 0.08).toFixed(2);

  return `              <motion.path
                d="${p.d}"${transformProp}
                className="fill-current"
                style={{ color: "${p.fill}" }}
                stroke="currentColor"
                strokeWidth={32}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ fillOpacity: 0, strokeOpacity: 1, pathLength: 0 }}
                animate={{ fillOpacity: 1, strokeOpacity: 0, pathLength: 1 }}
                transition={{
                  pathLength: { duration: 0.6, ease: "easeInOut", delay: ${delayDraw} },
                  fillOpacity: { duration: 0.4, delay: ${delayFill}, ease: "easeInOut" },
                  strokeOpacity: { duration: 0.3, delay: ${delayFill}, ease: "easeInOut" },
                }}
              />`;
}).join('\n');

const templateTsx = `"use client";

import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";

// Global tracker for initial bundle load to prevent hydration mismatch
let isInitialLoad = true;

// Determine layout group from pathname
function getLayoutGroup(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/eksperimen") || pathname.startsWith("/hasil-eksperimen")) return "eksperimen";
  if (pathname.startsWith("/pcb")) return "pcb";
  if (pathname.startsWith("/login")) return "auth";
  if (pathname.startsWith("/zn")) return "zn";
  if (pathname.startsWith("/arm3d-debug")) return "debug";

  return "marketing";
}

export default function RouteTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const currentGroup = getLayoutGroup(pathname);
  
  // Decide whether to animate based on whether it is initial load OR if layout group changed
  const [shouldAnimate, setShouldAnimate] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const prevGroup = window.sessionStorage.getItem("dynamics_last_layout_group");

      if (isInitialLoad) {
        // Always play on hard refresh / initial website load
        setShouldAnimate(true);
        isInitialLoad = false;
      } else if (prevGroup !== null && prevGroup === currentGroup) {
        // Skip animation if navigating within the same layout group
        setShouldAnimate(false);
      } else {
        // Trigger animation if moving to a different layout group
        setShouldAnimate(true);
      }

      // Save the current layout group for subsequent navigations
      window.sessionStorage.setItem("dynamics_last_layout_group", currentGroup);
    }
  }, [currentGroup]);

  // If we shouldn't animate, render children instantly without any overlay markup
  if (!shouldAnimate) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Root Layer: Manages structural layout and handles cleanup display switch */}
      <motion.div
        key="route-loader-layer"
        className="fixed inset-0 z-[99999] flex items-center justify-center bg-background pointer-events-none"
        initial={{ opacity: 1, display: "flex" }}
        animate={{ opacity: 0, transitionEnd: { display: "none" } }}
        transition={{ duration: 0.4, delay: 2.2, ease: "easeInOut" }}
      >
        {/* Logo Drawing Container */}
        <div className="w-45 h-45 md:w-55 md:h-55 flex items-center justify-center bg-transparent relative z-10 select-none">
          <div className="w-[80%] h-[80%] relative max-w-sm max-h-sm md:max-w-md md:max-h-md">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 9496 3281"
              fill="none"
              className="w-full h-full"
              style={{ overflow: "visible" }}
            >
\n` + renderedPaths + `\n
            </svg>
          </div>
        </div>
      </motion.div>

      {children}
    </>
  );
}
`;

fs.writeFileSync('app/template.tsx', templateTsx);
console.log('Template created with unified fade-out!');
