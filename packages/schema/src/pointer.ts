/** Échappe un segment de pointeur JSON (RFC 6901) : `~` puis `/`. */
export const escapePointerSegment = (segment: string): string =>
  segment.replaceAll("~", "~0").replaceAll("/", "~1");
