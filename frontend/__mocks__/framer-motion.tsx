import React from "react";

function makeMotionEl(tag: string) {
  return function MotionEl({
    children,
    initial: _i,
    animate: _a,
    exit: _e,
    transition: _t,
    whileTap: _wt,
    layoutId: _lid,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) {
    return React.createElement(tag, rest, children);
  };
}

export const motion = new Proxy({} as Record<string, unknown>, {
  get: (_target, tag: string) =>
    makeMotionEl(tag === "default" ? "div" : tag),
});

export function AnimatePresence({ children }: { children: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

export function useReducedMotion() {
  return false;
}
