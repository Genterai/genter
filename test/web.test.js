import assert from "node:assert/strict";
import dns from "node:dns";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { assertPublic, fetchAt, privateAddress, publicFetch } from "../src/net.js";
import { htmlText, namesSite, siteName, siteUrl, underSite } from "../src/web.js";

const SITE = "https://93.184.215.14/docs/"; // a public IP literal: no DNS

describe("Websites", () => {
  it("W3 HTML as text: headings and lists kept, scripts, navigation and footers dropped, links found", () => {
    const page = htmlText(`<html><head><title>Docs &amp; guides</title><script>x()</script></head><body>
      <nav><a href="/menu">Menu</a></nav><h1>Start</h1><p>Install it&nbsp;now.</p><ul><li>One</li><li>Two</li></ul>
      <a href='/guide/next'>Next</a><footer>© us</footer></body></html>`);
    assert.equal(page.title, "Docs & guides");
    assert.match(page.text, /^# Start\n\nInstall it now\.\n\n?- One\n- Two/);
    assert.doesNotMatch(page.text, /x\(\)|Menu|© us/);
    assert.deepEqual(page.links, ["/menu", "/guide/next"]);
  });

  it("W4 [rl:security/public-only] addresses: https added to a bare host, private networks refused", () => {
    assert.equal(siteUrl("docs.example.com"), "https://docs.example.com/");
    assert.throws(() => siteUrl("intranet"), /not a website/);
    assert.ok(underSite("https://www.docs.dev/guide/a", "docs.dev/guide/"));
    assert.ok(!underSite("https://docs.dev/blog/a", "docs.dev/guide/"));
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "192.168.1.5", "::1", "fd00::1", "::ffff:7f00:1"]) assert.ok(privateAddress(ip), ip);
    for (const ip of ["8.8.8.8", "104.20.23.154", "2606:4700::1"]) assert.ok(!privateAddress(ip), ip);
  });

  it("W6 [rl:security/public-only] private and reserved ranges, and an IPv4 address carried in IPv6 judged as that IPv4 address", () => {
    const refused = [
      ...["0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.168.0.1", "198.18.0.1", "224.0.0.1", "255.255.255.255"],
      ...["::", "::1", "0:0:0:0:0:0:0:1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "fec0::1", "ff02::1"], // loopback, unique local, link-local, multicast
      ...["::ffff:127.0.0.1", "::ffff:7f00:1", "[::ffff:7f00:1]", "0:0:0:0:0:ffff:7f00:1", "::ffff:a9fe:a9fe", "::ffff:0:7f00:1"], // mapped, translated
      ...["::127.0.0.1", "::a9fe:a9fe", "::10.0.0.5"], // compatible: ::a.b.c.d
      ...["64:ff9b::a9fe:a9fe", "64:ff9b::10.0.0.5", "64:ff9b::7f00:1", "64:ff9b:1::a00:5", "64:ff9b:1:ab::808:808"], // NAT64
      ...["2002:7f00:1::1", "2002:a9fe:a9fe::", "2001:0:4136:e378:8000:63bf:3fff:fdd2"], // 6to4, Teredo
      ...["192.0.2.1", "198.51.100.7", "203.0.113.9", "2001:db8::1", "3fff::1", "3fff:fff::1", "2001:2::1", "100::1"], // documentation, benchmarking, discard
      ...["not:an:address", "1.2.3", "999.1.1.1", "::ffff:999.0.0.1"], // what can not be read is not public
    ];
    const allowed = ["8.8.8.8", "172.32.0.1", "2606:4700::1111", "::ffff:808:808", "::ffff:8.8.8.8", "::808:808", "64:ff9b::808:808", "64:ff9b::8.8.8.8", "64:ff9b:1::808:808", "2002:808:808::1", "2001:4860:4860::8888", "198.51.99.1", "203.0.114.1"];
    for (const ip of refused) assert.ok(privateAddress(ip), ip);
    for (const ip of allowed) assert.ok(!privateAddress(ip), ip);
  });

  it("W7 [rl:security/public-only] every answer of a name is judged, and every hop of a redirect", async () => {
    await assert.rejects(assertPublic("https://mixed.example/", async () => ["93.184.215.14", "10.0.0.7"]), /not a public address/);
    await assert.rejects(assertPublic("https://nat64.example/", async () => ["64:ff9b::7f00:1"]), /not a public address/);
    await assert.rejects(assertPublic("https://nowhere.example/", async () => []), /does not resolve/);
    assert.deepEqual(await assertPublic("https://ok.example/", async () => ["93.184.215.14"]), ["93.184.215.14"]);
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "https://inside.example/admin" } });
    try {
      await assert.rejects(publicFetch("https://93.184.215.14/start", {}, { resolve: async () => ["127.0.0.1"] }), /inside\.example is not a public address/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// A server on this machine that counts what reaches it.
async function localServer(handle = (_req, res) => res.end("here")) {
  const seen = [];
  const server = createServer((req, res) => (seen.push(req), handle(req, res)));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { seen, port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)) };
}

describe("Connecting to the address checked", () => {
  it("W8 [rl:security/checked-address] a name that answers public, then private, is never fetched at the private one (DNS rebinding)", async () => {
    const server = await localServer();
    // The check sees the public answer; any lookup after it (the resolver again, or the system's at connect time, as
    // fetch makes) answers this machine, where the server waits.
    const systemLookup = dns.lookup;
    dns.lookup = (_host, options, callback) => {
      if (typeof options === "function") [callback, options] = [options, {}];
      return options?.all ? callback(null, [{ address: "127.0.0.1", family: 4 }]) : callback(null, "127.0.0.1", 4);
    };
    try {
      let lookups = 0;
      const resolve = async () => (lookups++ ? ["127.0.0.1"] : ["93.184.215.7"]);
      await assert.rejects(publicFetch(`http://rebind.example:${server.port}/secret`, { signal: AbortSignal.timeout(300) }, { resolve }));
      assert.equal(lookups, 1);
      assert.equal(server.seen.length, 0);
    } finally {
      dns.lookup = systemLookup;
      await server.close();
    }
  });

  it("W9 [rl:security/checked-address] the request connects to the addresses given, never asking DNS, under the name it was made for, with what fetch sent", async () => {
    const server = await localServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => res.writeHead(201, { "content-type": "text/plain", "x-seen": req.headers.host }).end(`got ${body}`));
    });
    try {
      // genter.test is a name no DNS answers: an answer can only come from the address given.
      const res = await fetchAt(`http://genter.test:${server.port}/mcp`, { method: "POST", headers: { Accept: "text/plain" }, body: "hello" }, ["127.0.0.1"]);
      assert.equal(res.status, 201);
      assert.equal(res.headers.get("x-seen"), `genter.test:${server.port}`);
      assert.equal(await res.text(), "got hello");
      assert.equal(server.seen.length, 1);
      const sent = server.seen[0].headers; // fetch's defaults where the caller says nothing, the caller's own kept
      assert.deepEqual([sent["user-agent"], sent.accept, sent["accept-language"]], ["node", "text/plain", "*"]);
    } finally {
      await server.close();
    }
  });

  it("W10 [rl:security/keys-stay] a redirect to another origin (scheme, host or port) drops the headers that carry keys; one on the same origin keeps them", async () => {
    const original = globalThis.fetch;
    const headers = { Authorization: "Bearer k", Cookie: "s=1", "X-Api-Key": "k", "Mcp-Session-Id": "m", "X-Auth-Token": "t", Accept: "application/json", "User-Agent": "GenterBot" };
    const keys = ["authorization", "cookie", "x-api-key", "mcp-session-id", "x-auth-token"];
    // A hop on the same origin, then one that changes only the host, only the scheme or only the port; after the host
    // change the chain comes back to the first origin, and the keys stay dropped.
    const away = { host: "https://93.184.215.9/c", scheme: "http://93.184.215.14/c", port: "https://93.184.215.14:8443/c" };
    try {
      for (const [change, to] of Object.entries(away)) {
        const sent = [];
        const hops = { "https://93.184.215.14/a": "/b", "https://93.184.215.14/b": to, "https://93.184.215.9/c": "https://93.184.215.14/d" };
        globalThis.fetch = async (url, init) => {
          sent.push({ url: String(url), headers: Object.fromEntries(new Headers(init.headers)) });
          const next = hops[String(url)];
          return next ? new Response(null, { status: 302, headers: { location: next } }) : new Response("end", { status: 200 });
        };
        const { url } = await publicFetch("https://93.184.215.14/a", { headers });
        assert.equal(url, change === "host" ? "https://93.184.215.14/d" : to);
        assert.deepEqual(Object.keys(sent[1].headers).sort(), [...keys, "accept", "user-agent"].sort(), change); // same origin: all kept
        assert.equal(sent[2].url, to);
        for (const hop of sent.slice(2)) {
          for (const key of keys) assert.equal(hop.headers[key], undefined, `${change}: ${hop.url} ${key}`);
          assert.equal(hop.headers.accept, "application/json");
        }
      }
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("Site names", () => {
  it("W5 a site is called by the name its domain is registered under, and a request names it by that word", () => {
    assert.equal(siteName("https://www.evallens.io/team"), "evallens");
    assert.equal(siteName("https://docs.acme.co.uk/start"), "acme");
    assert.equal(siteName("https://acme.github.io/"), "acme");
    assert.equal(siteName("https://blog.eval-lens.com/"), "evallens");
    assert.equal(siteName(SITE), null); // an IP address has no name
    assert.equal(siteName("https://x.ai/"), null); // too short to tell from a word
    assert.ok(namesSite("Код продуктовнер в Evallens?", "https://evallens.io/"));
    assert.ok(namesSite("pricing on EvalLens.io", "https://www.evallens.io/pricing"));
    assert.ok(namesSite("who is behind Eval Lens", "https://evallens.io/"));
    assert.ok(!namesSite("evallensbot logs", "https://evallens.io/"));
  });
});
