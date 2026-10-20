# 4d4y built-in reader: feasibility PoC

Branch: `poc/hipda-client` · Worktree: `lopda-hipda-client` · Runtime: 0.30.0 · 2026-10-19

## 1. Feasibility

**No, not from this environment today.** A Lo-PDA built-in can make the request (built-ins are not under the
community app's `connect-src 'none'`), but the browser cannot read 4d4y's forum HTML: the edge returns a
Cloudflare managed challenge and no `Access-Control-Allow-Origin` on that response. The app therefore shows
`TypeError: Failed to fetch`, not a forum.

This is not a Lo-PDA sandbox or URL problem. It is the site's edge policy plus cross-origin read rules. A plain
web page on any origin sees the same result. The one request that does work from the browser is `robots.txt`
(`200` + `Access-Control-Allow-Origin: *`), which is what the app's probe uses to prove that DNS, HTTPS and CORS
plumbing are otherwise fine.

The parser and UI are feasible; they were verified against synthetic Discuz fixtures and mocked e2e pages. On a
network where 4d4y serves the forum HTML with CORS, the same app code renders live content.

## 2. Network evidence

From the development machine (Cloudflare ray `EWR`), 2026-10-20 UTC:

| Request | Result |
|---|---|
| `https://www.4d4y.com/` | `HTTP/2 403`, `cf-mitigated: challenge`, no `access-control-allow-origin` |
| `/forum.php`, `/forum/`, `/forumdisplay.php?fid=2`, `/forum/viewthread.php?tid=…` | same `403` + challenge |
| `?mobile=2`, `?mod=guide&view=newthread`, `?mod=rss`, `/rss.php` | same `403` + challenge |
| `4d4y.com`, IPv6, Chrome UA, HiPDA UA (`net.jejer.hipda 5.1.0`) | same `403` + challenge |
| `https://www.4d4y.com/robots.txt` | `200`, `access-control-allow-origin: *` |

In headless Chromium, from `https://nowheremanx.github.io/lopda/runtime/`:

```
robots.txt  -> {ok: true, status: 200, type: "cors"}
/           -> TypeError: Failed to fetch
```

Direct navigation to `/` stays on the `Just a moment...` challenge for at least 12 s. `bbs.4d4y.com`,
`forum.4d4y.com` and `m.4d4y.com` do not resolve. `hi-pda.com` now redirects to an ad feed, not a mirror.

Why a browser cannot work around it:

- The challenge response has no CORS header, so `fetch` rejects before any status or body is visible.
- `credentials: "include"` would send `cf_clearance`, but a credentialed CORS response needs an exact origin
  and `Access-Control-Allow-Credentials: true`; the site's allowed responses use `*`.
- `credentials: "omit"` does not send the clearance cookie.
- A cross-origin `fetch` cannot run Cloudflare's challenge JavaScript.

No proxy, cookie, login or challenge bypass was added.

## 3. Parsing

4d4y is a Discuz forum. The parser handles the two shapes found in the HiPDA-NG client's selectors and stock
Discuz X3:

- Forum index: `a[href*="forumdisplay.php?fid="]`, `a[href*="mod=forumdisplay"][href*="fid="]`.
- Thread rows: `#threadlisttableid tbody[id]`, `tbody[id^="normalthread_"]`, `tbody[id^="stickthread_"]`.
- Title: `th.subject span a`, `th.common a.xst`, `th a.xst`, `a.xst`, `a[href*="viewthread"]`.
- Author: `td.author cite a` (4d4y custom theme), `td.by cite a` (stock), `cite a`.
- Last reply time: `td.lastpost em a` / `td.lastpost em`; stock Discuz has two `td.by` cells, so the parser uses
  the last one. Replies/views: `td.nums strong`, `td.num a`.
- Thread title: `#threadtitle` (copy-link text removed), `#nav`, `<title>`.
- Posts: direct `div[id^="post_"]` children of `#postlist`, then filtered global post divs.
- Post author: `td.postauthor .postinfo a`, `td.postauthor a`, `.authi a`, `space.php?uid=` links.
- Post time: `td.postauthor .authorinfo em`, `td.postauthor .postinfo em`, `em[id^="authorposton"]`, `.dateline`.
- Post content: `.t_msgfont`, `.t_fontsize`, `.postmessage`, `.message`, `td.postcontent` fallback.

Fields parsed: forum name, topic title, topic URL, author, last-reply time, replies, sticky flag; thread title,
post author, post time, and text content. Content is text only: block elements and `<br>` become newlines,
scripts/styles/players are dropped, image `alt` text is kept, links become their text. No HTML is injected.

Hard fields: last-reply time on stock Discuz (two `td.by` cells), the portal's forum list (many duplicate
links), relative times (`半小时前`) that are shown as-is, edited-post notices, and lazy-loaded/attachment-only
posts. Pagination is not implemented: first page, first 8 non-empty posts, 2400 chars each.

Fixtures are synthetic Discuz markup (`tests/fixtures/fourm-*.html`), not captured 4d4y HTML. The live site
could not be captured because of the challenge; this is a real limitation of the experiment.

## 4. UI

One built-in, no chin pad, tap-driven. Header with back arrow, title and state line; one scrolling list.

- Index: Forums section, Latest section; each row is 44 px, title (two lines max) plus `author · time · replies`.
- Forum: the same list from a `forumdisplay` page.
- Thread: title, post count, up to 8 posts with author, time and text.
- Loading: `Connecting…` -> `HTTP 200 · 123 KB` -> `Parsing…` -> `12 topics`.
- Failure: `Network Error` / `HTTP Error` / `Cloudflare Challenge` / `Parse Error` / `Runtime Error`, with type,
  URL, HTTP status when readable, bytes, the browser's error, response headers when readable, and a `robots.txt`
  probe that separates network/CORS failure from a blocked forum page. Retry restarts at the index. Requests time
  out after 15 s and are reported as `Timeout`.
- Offline sample: an explicit `Offline sample: synthetic Discuz HTML, not live 4d4y` banner; used only to
  exercise the parser and the topic screen when the network is blocked.

## 5. Size

At the time of writing:

| Piece | Bytes |
|---|---:|
| `runtime/apps/fourm.js` | 18,480 |
| `runtime/fourmparse.js` | 8,644 |
| app + parser | **27,124** |

No bundle, framework, font or icon library. The only other additions are a small CSS block, strings, the view
markup and tests. The 512 KB app limit is not close.

## 6. Architecture implications

A per-app network capability is worth doing **only if the target cooperates**. The right shape would be a
manifest permission (`"network": ["https://www.4d4y.com"]`), a per-app sandbox CSP `connect-src` with exactly
those hosts, GET-only requests without credentials or referrer, a response-size cap, and no redirects to
unlisted hosts. `tools/check-app.mjs` would enforce the manifest/CSP agreement; the runtime would be the only
place that fetches.

That design does not solve Cloudflare. For 4d4y specifically, a CSP allowlist changes nothing: the browser still
cannot read the challenged response. The options are a server-side proxy (out of scope, new trust/cost/terms
questions), a server-side policy change at 4d4y, or a non-browser client with cookies/UA that Cloudflare accepts.
A built-in probe is the right place to establish that before committing to a generic network API.

## 7. Problems found

1. 4d4y serves a Cloudflare managed challenge to this network for every forum URL tested, including RSS and mobile.
2. The challenge response has no `Access-Control-Allow-Origin`; the browser exposes neither status nor headers.
3. `robots.txt` is `200` with `ACAO: *`; CORS itself is not the root problem, the HTML policy is.
4. No alternate host (`bbs.`, `forum.`, `m.`) resolves; `hi-pda.com` is not a mirror.
5. Community apps cannot help: their CSP is `connect-src 'none'` and the checker rejects `fetch`. This PoC must be a built-in.
6. A credentialed fetch cannot reuse a manual Cloudflare clearance because the site's CORS is `*`.
7. The actual 4d4y theme could not be captured, so the parser is verified against HiPDA's selectors and stock
   Discuz markup. If 4d4y's current theme differs, live parsing may need selector adjustments.
8. Text-only rendering loses images, quotes, code blocks and formatting; acceptable for the probe, not a client.
9. There is no pagination, search, login, reply, favourite or notification; all were explicit non-goals.

## Reproduction

```sh
node --test tests/fourm.test.mjs tests/strings.test.mjs tests/repo.test.mjs
node --test --test-name-pattern="4d4y|each built-in" tests/e2e.test.mjs
python3 -m http.server 8086   # from the repo root, open /runtime/
```

Live check on a phone: open the runtime over HTTPS, tap `4d4y`. If the network can reach 4d4y, the list appears;
if not, the error panel and the `robots.txt` probe show exactly where it stopped.

The full unit suite passes except `tests/zip.test.mjs`'s `unzip -l` check, which also fails on `main` on this Mac
because Info-ZIP garbles UTF-8 names; it is unrelated to this PoC. The relevant checks are green:
`tests/fourm.test.mjs` (7), `tests/strings.test.mjs` and `tests/repo.test.mjs` (35 together), and the four 4d4y
e2e tests plus the built-in first-screen test.
