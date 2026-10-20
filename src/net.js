import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { pipeline, Readable } from "node:stream";
import zlib from "node:zlib";

// Fetching addresses people type in (an MCP server, a website): only public hosts, never this machine or its network,
// also after a redirect. A name is looked up once per hop: every answer must be public, and the request connects to
// those checked addresses, so a second DNS answer can not swap in a private one (DNS rebinding).

const PRIVATE_V4 = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.168.0.0/16", "198.18.0.0/15", "224.0.0.0/3"];

const v4 = (ip) => ip.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
function privateV4(ip) {
  const n = v4(ip);
  return PRIVATE_V4.some((cidr) => {
    const [base, bits] = cidr.split("/");
    return n >= v4(base) && n < v4(base) + 2 ** (32 - Number(bits));
  });
}

// An IPv6 address as its eight 16-bit groups (a dotted IPv4 tail and a %zone allowed), or null.
function hextets(ip) {
  let text = ip.replace(/%.*$/, "");
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    if (isIP(dotted[0]) !== 4) return null;
    text = text.slice(0, dotted.index) + `${((+dotted[1] << 8) | +dotted[2]).toString(16)}:${((+dotted[3] << 8) | +dotted[4]).toString(16)}`;
  }
  const [head, tail, more] = text.split("::");
  if (more !== undefined) return null;
  const a = head ? head.split(":") : [];
  const b = tail === undefined ? null : tail ? tail.split(":") : [];
  const groups = b ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

const quad = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

export function privateAddress(ip) {
  if (isIP(ip) === 4) return privateV4(ip);
  const h = hextets(String(ip).toLowerCase().replace(/^\[|\]$/g, ""));
  if (!h) return true; // not an address this code can read: not public
  const zero = (from, to) => h.slice(from, to).every((x) => x === 0);
  // An IPv4 address carried in IPv6 is judged as that IPv4 address: mapped (::ffff:a.b.c.d, which URL writes in hex as
  // ::ffff:7f00:1), compatible (::a.b.c.d; :: and ::1 fall in 0.0.0.0/8), translated (::ffff:0:a.b.c.d), NAT64
  // (64:ff9b::/96, and the local-use 64:ff9b:1::/48 in its /96 form, any other address of it refused) and 6to4
  // (2002::/16). Teredo (2001::/32) hides its IPv4 address, so it is refused.
  if (zero(0, 5) && (h[5] === 0xffff || h[5] === 0)) return privateV4(quad(h[6], h[7]));
  if (zero(0, 4) && h[4] === 0xffff && h[5] === 0) return privateV4(quad(h[6], h[7]));
  if (h[0] === 0x64 && h[1] === 0xff9b && zero(2, 6)) return privateV4(quad(h[6], h[7]));
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 1) return !zero(3, 6) || privateV4(quad(h[6], h[7]));
  if (h[0] === 0x2002) return privateV4(quad(h[1], h[2]));
  if (h[0] === 0x2001 && h[1] === 0) return true;
  // Unique local fc00::/7, link-local fe80::/10, the old site-local fec0::/10, multicast ff00::/8.
  return (h[0] & 0xfe00) === 0xfc00 || (h[0] & 0xff80) === 0xfe80 || (h[0] & 0xff00) === 0xff00;
}

const hostOf = (url) => new URL(url).hostname.replace(/^\[|\]$/g, "");
const resolveAll = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

// Throws unless the URL is http(s) on a host that resolves only to public addresses; answers the addresses checked (an
// IP address stands for itself). `resolve(host)` answers a name's addresses (DNS by default).
export async function assertPublic(url, resolve = resolveAll) {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${url}: only http and https addresses`);
  const host = hostOf(u);
  if (/(^|\.)(localhost|local|internal|localdomain)$/i.test(host)) throw new Error(`${u.hostname} is not a public address`);
  const addresses = isIP(host) ? [host] : await Promise.resolve(host).then(resolve).catch(() => []);
  if (!addresses.length) throw new Error(`${u.hostname} does not resolve`);
  if (addresses.some(privateAddress)) throw new Error(`${u.hostname} is not a public address`);
  return addresses;
}

// The connection's own lookup: only the addresses that were checked, never DNS again.
const pinned = (addresses) => (_host, options, callback) => {
  const answers = addresses.map((address) => ({ address, family: isIP(address) })).filter((a) => !options.family || a.family === options.family);
  if (!answers.length) return callback(Object.assign(new Error("no checked address of that family"), { code: "ENOTFOUND" }));
  if (options.all) callback(null, answers);
  else callback(null, answers[0].address, answers[0].family);
};

const DECODE = { gzip: zlib.createGunzip, "x-gzip": zlib.createGunzip, deflate: zlib.createInflate, br: zlib.createBrotliDecompress };

// A request to a URL whose name was checked, connecting only to `addresses` (TLS still checks the name): node's
// http(s) client, since fetch can not be told where to connect. Answers a fetch Response: the body decoded,
// redirects not followed.
export function fetchAt(url, init, addresses) {
  const u = new URL(url);
  const method = String(init.method ?? "GET").toUpperCase();
  const headers = Object.fromEntries(new Headers(init.headers));
  headers["accept-encoding"] ??= "gzip, deflate, br";
  const body = init.body == null ? undefined : typeof init.body === "string" || init.body instanceof Uint8Array ? init.body : String(init.body);
  if (body !== undefined) headers["content-length"] ??= String(Buffer.byteLength(body));
  return new Promise((resolve, reject) => {
    const client = u.protocol === "https:" ? https : http;
    const req = client.request(u, { method, headers, signal: init.signal, lookup: pinned(addresses), agent: false }, (res) => {
      const out = new Headers();
      for (let i = 0; i < res.rawHeaders.length; i += 2) {
        try {
          out.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
        } catch {} // a header fetch would not take either
      }
      const empty = method === "HEAD" || [204, 205, 304].includes(res.statusCode);
      const decode = DECODE[String(res.headers["content-encoding"] ?? "").trim().toLowerCase()];
      try {
        if (empty) res.on("error", () => {}).resume();
        const stream = empty ? null : decode ? pipeline(res, decode(), () => {}) : res;
        resolve(new Response(stream && Readable.toWeb(stream), { status: res.statusCode, headers: out }));
      } catch (e) {
        res.destroy();
        reject(e);
      }
    });
    req.on("error", reject);
    req.end(body);
  });
}

// Keys are for the origin they were given to: a header that carries one (Authorization, Cookie, an API key, an MCP
// session) does not follow a redirect to another origin.
const KEY_HEADER = /auth|cookie|key|token|secret|session|password/i;
function withoutKeys(headers) {
  const out = new Headers(headers);
  for (const name of [...out.keys()]) if (KEY_HEADER.test(name)) out.delete(name);
  return out;
}

// fetch with redirects followed by hand, each hop checked; a name connects to the addresses checked, an IP address
// (nothing to look up, nothing to swap) goes to fetch as it is. Answers { res, url } (url: where it ended up).
export async function publicFetch(url, init = {}, { redirects = 5, resolve } = {}) {
  for (let hop = 0; ; hop++) {
    const addresses = await assertPublic(url, resolve);
    const res = isIP(hostOf(url)) ? await fetch(url, { ...init, redirect: "manual" }) : await fetchAt(url, init, addresses);
    const location = res.status >= 300 && res.status < 400 && res.headers.get("location");
    if (!location) return { res, url };
    await res.body?.cancel().catch(() => {});
    if (hop >= redirects) throw new Error(`${url}: too many redirects`);
    const next = new URL(location, url);
    if (next.origin !== new URL(url).origin) init = { ...init, headers: withoutKeys(init.headers) };
    url = next.toString();
  }
}

// A body as text, at most `max` bytes (the rest is not downloaded).
export async function textOf(res, max = 2_000_000) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const parts = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(parts).subarray(0, max));
}
