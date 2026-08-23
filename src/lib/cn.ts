import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines conditional class values (clsx) and resolves Tailwind conflicts
 * (tailwind-merge) — later classes win, so component defaults can be
 * overridden via a `className` prop.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
