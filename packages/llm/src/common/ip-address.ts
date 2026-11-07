const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const BYTE_MAX = 255;
const GROUPS = 8;

type Range = readonly [prefix: number, bits: number];

const v4 = (a: number, b: number, c: number, d: number): number =>
  ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;

/** Plages IPv4 non publiques : privées, bouclage, lien local, partagées, documentation, réservées. */
const PRIVATE_V4: readonly Range[] = [
  [v4(0, 0, 0, 0), 8],
  [v4(10, 0, 0, 0), 8],
  [v4(100, 64, 0, 0), 10],
  [v4(127, 0, 0, 0), 8],
  [v4(169, 254, 0, 0), 16],
  [v4(172, 16, 0, 0), 12],
  [v4(192, 0, 0, 0), 24],
  [v4(192, 0, 2, 0), 24],
  [v4(192, 168, 0, 0), 16],
  [v4(198, 18, 0, 0), 15],
  [v4(198, 51, 100, 0), 24],
  [v4(203, 0, 113, 0), 24],
  [v4(224, 0, 0, 0), 3],
];

const inRange = (address: number, [prefix, bits]: Range): boolean =>
  bits === 0 || address >>> (32 - bits) === prefix >>> (32 - bits);

/** Entier 32 bits d'une adresse IPv4 en notation pointée stricte, sinon `undefined`. */
const parseV4 = (text: string): number | undefined => {
  const match = IPV4.exec(text);
  if (match === null) {
    return undefined;
  }
  const parts = match.slice(1).map(Number);
  return parts.some((part) => part > BYTE_MAX)
    ? undefined
    : v4(parts[0] as number, parts[1] as number, parts[2] as number, parts[3] as number);
};

const expandTail = (text: string): string | undefined => {
  const dot = text.lastIndexOf(".");
  if (dot < 0) {
    return text;
  }
  const colon = text.lastIndexOf(":");
  const embedded = parseV4(text.slice(colon + 1));
  return embedded === undefined
    ? undefined
    : `${text.slice(0, colon + 1)}${(embedded >>> 16).toString(16)}:${(embedded & 0xffff).toString(16)}`;
};

/** Huit groupes de 16 bits d'une adresse IPv6 (compression et forme mappée comprises). */
const parseV6 = (text: string): number[] | undefined => {
  const expanded = expandTail(text);
  const halves = expanded?.split("::");
  if (expanded === undefined || halves === undefined || halves.length > 2) {
    return undefined;
  }
  const groups = (part: string): string[] => (part === "" ? [] : part.split(":"));
  const head = groups(halves[0] as string);
  const tail = groups(halves[1] ?? "");
  const fill = halves.length === 2 ? GROUPS - head.length - tail.length : 0;
  const all = [...head, ...Array<string>(Math.max(fill, 0)).fill("0"), ...tail];
  const values = all.map((group) =>
    /^[0-9a-f]{1,4}$/i.test(group) ? Number.parseInt(group, 16) : -1,
  );
  return values.length === GROUPS && values.every((v) => v >= 0) ? values : undefined;
};

const isPrivateV6 = (g: number[]): boolean => {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, x = 0, y = 0] = g;
  const mappedV4 = a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff;
  if (mappedV4) {
    return PRIVATE_V4.some((range) => inRange(v4(x >> 8, x & 0xff, y >> 8, y & 0xff), range));
  }
  const unspecifiedOrLoopback = g.slice(0, 7).every((v) => v === 0) && y <= 1;
  return (
    unspecifiedOrLoopback ||
    (a & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (a & 0xffc0) === 0xfe80 || // lien local fe80::/10
    (a & 0xffc0) === 0xfec0 || // site local (obsolète)
    (a & 0xff00) === 0xff00 || // multicast
    (a === 0x64 && b === 0xff9b) || // NAT64 : l'adresse v4 embarquée n'est pas contrôlée
    a === 0x2002 || // 6to4
    (a === 0x2001 && (b === 0 || b === 0xdb8)) || // Teredo, documentation
    (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0) // IPv4 compatible
  );
};

/**
 * Vrai pour toute adresse non publique. Une chaîne qui n'est pas une adresse est traitée comme
 * privée : en cas de doute, on refuse.
 */
export const isPrivateAddress = (address: string): boolean => {
  const bare = address.replace(/^\[|\]$/g, "");
  const ipv4 = parseV4(bare);
  if (ipv4 !== undefined) {
    return PRIVATE_V4.some((range) => inRange(ipv4, range));
  }
  const ipv6 = parseV6(bare);
  return ipv6 === undefined ? true : isPrivateV6(ipv6);
};

/** Littéral IP (v4 pointé ou v6 entre crochets) tel que `URL.hostname` le normalise. */
export const isIpLiteral = (hostname: string): boolean =>
  parseV4(hostname) !== undefined || (hostname.startsWith("[") && hostname.endsWith("]"));
