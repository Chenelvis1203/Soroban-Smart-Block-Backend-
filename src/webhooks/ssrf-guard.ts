/**
 * SSRF protection for outbound webhook HTTP requests.
 *
 * Blocks:
 *   - Loopback          127.0.0.0/8, ::1
 *   - Private networks  10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *   - Link-local        169.254.0.0/16 (AWS/GCP/Azure metadata), fe80::/10
 *   - Unique-local IPv6 fc00::/7
 *   - Cloud metadata    169.254.169.254, fd00:ec2::254
 *   - Unspecified       0.0.0.0/8, ::
 *   - Plain HTTP in non-dev environments
 *
 * Usage:
 *   await assertSafeUrl(url);          // throws SsrfBlockedError if unsafe
 *   const safeAxios = buildSafeAgent() // axios instance that re-checks on redirect
 */

import dns from 'dns';
import net from 'net';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`SSRF blocked: ${reason}`);
    this.name = 'SsrfBlockedError';
  }
}

// ---------------------------------------------------------------------------
// IP range matchers
// ---------------------------------------------------------------------------

/** Convert a dotted-decimal IPv4 string to a 32-bit integer. */
function ipv4ToInt(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

interface Ipv4Range {
  base: number;
  mask: number;
}

function makeRange(cidr: string): Ipv4Range {
  const [addr, bits] = cidr.split('/');
  const mask = bits ? (~0 << (32 - parseInt(bits, 10))) >>> 0 : 0xffffffff;
  return { base: ipv4ToInt(addr) & mask, mask };
}

const BLOCKED_IPV4_RANGES: Ipv4Range[] = [
  makeRange('0.0.0.0/8'),       // unspecified / "this" network
  makeRange('10.0.0.0/8'),      // private
  makeRange('100.64.0.0/10'),   // shared address space (RFC 6598)
  makeRange('127.0.0.0/8'),     // loopback
  makeRange('169.254.0.0/16'),  // link-local / AWS metadata
  makeRange('172.16.0.0/12'),   // private
  makeRange('192.0.0.0/24'),    // IETF protocol assignments
  makeRange('192.168.0.0/16'),  // private
  makeRange('198.18.0.0/15'),   // benchmarking
  makeRange('198.51.100.0/24'), // TEST-NET-2 (documentation)
  makeRange('203.0.113.0/24'),  // TEST-NET-3 (documentation)
  makeRange('224.0.0.0/4'),     // multicast
  makeRange('240.0.0.0/4'),     // reserved
  makeRange('255.255.255.255/32'), // broadcast
];

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some((r) => (n & r.mask) === r.base);
}

function isBlockedIpv6(ip: string): boolean {
  // Normalise — strip zone IDs and brackets
  const addr = ip.replace(/^.*%.*$/, '').replace(/^\[|\]$/g, '').toLowerCase();

  // Unspecified :: and loopback ::1
  if (addr === '::' || addr === '::1') return true;

  // IPv4-mapped IPv6 ::ffff:a.b.c.d
  const ipv4Mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Mapped) return isBlockedIpv4(ipv4Mapped[1]);

  // Link-local fe80::/10
  if (/^fe[89ab][0-9a-f]:/i.test(addr)) return true;

  // Unique-local fc00::/7
  if (/^f[cd][0-9a-f]{2}:/i.test(addr)) return true;

  // AWS IPv6 metadata fd00:ec2::254
  if (addr === 'fd00:ec2::254') return true;

  // Multicast ff00::/8
  if (/^ff/i.test(addr)) return true;

  return false;
}

/** Returns true if the given IP string (v4 or v6) should be blocked. */
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return false; // not a recognised IP format — let DNS resolution handle it
}

// ---------------------------------------------------------------------------
// URL-level checks
// ---------------------------------------------------------------------------

const ALLOWED_PROTOCOLS = new Set(['https:']);
// Allow plain HTTP only in explicit dev/local profiles
const HTTP_ALLOWED_PROFILES = new Set(['local', 'devnet', 'test']);

function isHttpAllowed(): boolean {
  const profile = (process.env.NETWORK_PROFILE ?? process.env.NODE_ENV ?? '').toLowerCase();
  return HTTP_ALLOWED_PROFILES.has(profile);
}

/**
 * Resolve all A/AAAA records for `hostname` and throw if any is in a
 * blocked range.
 */
async function assertHostnameResolvesToPublicIp(hostname: string): Promise<void> {
  // Short-circuit for bare IPs — no DNS lookup needed
  if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new SsrfBlockedError(`IP address ${hostname} is in a blocked range`);
    }
    return;
  }

  // Reject raw hostnames that look like internal names
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new SsrfBlockedError(`Hostname "${hostname}" is reserved for internal use`);
  }

  const results: string[] = [];
  const [v4, v6] = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);

  if (v4.status === 'fulfilled') results.push(...v4.value);
  if (v6.status === 'fulfilled') results.push(...v6.value);

  if (results.length === 0) {
    throw new SsrfBlockedError(`Hostname "${hostname}" did not resolve to any IP address`);
  }

  for (const ip of results) {
    if (isBlockedIp(ip)) {
      throw new SsrfBlockedError(
        `Hostname "${hostname}" resolves to blocked IP ${ip}`,
      );
    }
  }
}

/**
 * Validate a webhook URL string and perform DNS pre-flight checks.
 *
 * Throws `SsrfBlockedError` if:
 *   - The protocol is not https (outside dev profiles)
 *   - The hostname resolves to a private/loopback/metadata IP
 *   - The URL is otherwise malformed
 */
export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`Malformed URL: ${rawUrl}`);
  }

  const proto = parsed.protocol;

  if (proto === 'http:' && !isHttpAllowed()) {
    throw new SsrfBlockedError(
      'Plain HTTP is not permitted for webhook destinations outside dev/local profiles',
    );
  }

  if (!ALLOWED_PROTOCOLS.has(proto) && !(proto === 'http:' && isHttpAllowed())) {
    throw new SsrfBlockedError(`Protocol "${proto}" is not allowed for webhook destinations`);
  }

  await assertHostnameResolvesToPublicIp(parsed.hostname);
}

// ---------------------------------------------------------------------------
// Axios transport with per-redirect re-validation
// ---------------------------------------------------------------------------

import axios, { AxiosInstance } from 'axios';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

/**
 * Return an Axios instance that:
 *   1. Disables automatic redirects so we can validate each hop.
 *   2. Follows redirects manually, re-checking the destination URL each time.
 *   3. Resolves the final IP before the actual POST and blocks if private.
 *
 * The caller should pass `REQUEST_TIMEOUT_MS` as the timeout.
 */
export function buildSafeAxios(timeoutMs: number): AxiosInstance {
  return axios.create({
    timeout: timeoutMs,
    maxRedirects: 0, // we follow manually below
    validateStatus: () => true,
    // Dedicated agents so we control socket reuse
    httpAgent: new HttpAgent({ keepAlive: false }),
    httpsAgent: new HttpsAgent({ keepAlive: false }),
  });
}

/**
 * POST `body` to `url` with SSRF protection on every hop.
 *
 * - Validates the initial URL before the first request.
 * - On a 3xx response, validates the redirect target before following.
 * - Maximum 5 redirects.
 *
 * Returns the final Axios response.
 */
export async function safePost(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ status: number; data: unknown }> {
  const MAX_REDIRECTS = 5;
  const client = buildSafeAxios(timeoutMs);

  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Re-validate URL and DNS on every hop (catches redirect-based bypasses)
    await assertSafeUrl(currentUrl);

    const response = await client.post(currentUrl, body, { headers });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers['location'];
      if (!location) {
        throw new SsrfBlockedError('Redirect response missing Location header');
      }
      // Resolve relative redirects
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return { status: response.status, data: response.data };
  }

  throw new SsrfBlockedError(`Exceeded maximum redirect limit (${MAX_REDIRECTS})`);
}
