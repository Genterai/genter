import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { privateAddress } from "../src/net.js";
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
