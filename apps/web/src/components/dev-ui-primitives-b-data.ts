import type {
  AvatarSize,
  AvatarTone,
  CountBadgeTone,
  IconTileSize,
  IconTileTone,
  PillSize,
  PillTone,
  Role,
} from "@koklo/ui";

export const PILL_SIZES: readonly PillSize[] = ["xs", "sm", "md"];

export const PILL_TONES: readonly PillTone[] = [
  "neutral",
  "soft",
  "outline",
  "dashed",
  "primary",
  "success",
  "warning",
  "danger",
  "muted",
];

export const COUNT_TONES: readonly CountBadgeTone[] = [
  "soft",
  "primary",
  "success",
  "warning",
  "outline",
];

export const ROLES: readonly Role[] = [
  "owner",
  "admin",
  "developer",
  "designer",
  "business",
  "client",
];

export const AVATAR_SIZES: readonly AvatarSize[] = [24, 28, 32, 36, 40, 56];
export const AVATAR_TONES: readonly AvatarTone[] = ["muted", "soft", "warning", "agent"];

export const TILE_SIZES: readonly IconTileSize[] = [28, 32, 36, 40, 48];
export const TILE_TONES: readonly IconTileTone[] = ["soft", "primary", "success", "warning"];
