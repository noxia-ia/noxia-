"use client";
import { useState, useCallback } from "react";
export function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  return { on, toggle: useCallback(() => setOn(v => !v), []), close: useCallback(() => setOn(false), []) };
}
