import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Compose des classes conditionnelles (clsx) puis résout les conflits Tailwind (tailwind-merge). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
