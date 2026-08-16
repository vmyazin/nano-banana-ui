/**
 * Address checks for the dropped-image proxy.
 *
 * A URL the user dropped is fetched by the server, which sits inside the deployment's
 * network. Without this check the proxy would happily read a cloud metadata endpoint
 * (169.254.169.254), a service bound to loopback, or anything else on the private side
 * of the firewall, and hand the bytes back to the browser. Every address the hostname
 * resolves to is checked, at every redirect hop.
 */

/** [network, prefix length] pairs, as dotted-quad strings. */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. 255.255.255.255
];

function v4ToInt(address: string): number | undefined {
  const parts = address.split('.');
  if (parts.length !== 4) return undefined;

  let value = 0;
  for (const part of parts) {
    // Reject "01", "0x7f" and other alternate forms rather than guessing at them:
    // they are a classic way to smuggle 127.0.0.1 past a naive parser.
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    value = value * 256 + octet;
  }
  return value;
}

function isBlockedV4(address: string): boolean {
  const value = v4ToInt(address);
  if (value === undefined) return true; // Unparseable is never worth fetching.

  return BLOCKED_V4.some(([network, prefix]) => {
    const networkValue = v4ToInt(network);
    if (networkValue === undefined) return false;
    // >>> 0 keeps the mask unsigned; a /0 shift would be a no-op, but none is listed.
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) >>> 0 === (networkValue & mask) >>> 0;
  });
}

/** Expand an IPv6 literal to its 16 bytes, or undefined when it does not parse. */
export function v6ToBytes(address: string): Uint8Array | undefined {
  const zoneless = address.split('%')[0];
  const halves = zoneless.split('::');
  if (halves.length > 2) return undefined;

  const parseGroups = (part: string): number[] | undefined => {
    if (!part) return [];
    const groups: number[] = [];
    for (const piece of part.split(':')) {
      if (piece.includes('.')) {
        // Trailing dotted quad, as in ::ffff:127.0.0.1
        const value = v4ToInt(piece);
        if (value === undefined) return undefined;
        groups.push((value >>> 16) & 0xffff, value & 0xffff);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return undefined;
      groups.push(Number.parseInt(piece, 16));
    }
    return groups;
  };

  const head = parseGroups(halves[0]);
  const tail = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (!head || !tail) return undefined;

  const total = head.length + tail.length;
  if (halves.length === 1 ? total !== 8 : total > 7) return undefined;

  const groups = [...head, ...Array(8 - total).fill(0), ...tail];
  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    bytes[index * 2] = (group >>> 8) & 0xff;
    bytes[index * 2 + 1] = group & 0xff;
  });
  return bytes;
}

function isBlockedV6(address: string): boolean {
  const bytes = v6ToBytes(address);
  if (!bytes) return true;

  const isZero = bytes.every((byte) => byte === 0);
  const isLoopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  if (isZero || isLoopback) return true;

  // IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96) both carry a v4 address in the
  // last four bytes — check that address, or a loopback slips through in v6 clothing.
  const mappedPrefix = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const nat64Prefix =
    bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((byte) => byte === 0);
  if (mappedPrefix || nat64Prefix) {
    return isBlockedV4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  }

  if ((bytes[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (bytes[0] === 0xff) return true; // ff00::/8 multicast
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true; // 2001:db8::/32

  return false;
}

/** True when the server must not open a connection to this address. */
export function isBlockedAddress(address: string, family?: number): boolean {
  const trimmed = address.trim();
  if (!trimmed) return true;
  if (family === 4 || (family === undefined && trimmed.includes('.') && !trimmed.includes(':'))) {
    return isBlockedV4(trimmed);
  }
  return isBlockedV6(trimmed);
}
