// Stats API for the links site.
//   POST /track  - the site reports a page view, link click or link copy
//   GET  /stats  - the site owner reads totals, per-link clicks and visitors by IP
// /stats needs a GitHub token belonging to an owner (OWNERS) or someone who can push to GITHUB_REPO.

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|headless|lighthouse|curl|wget|python|axios|node-fetch/i;
const DAY = 86400000;
const OWNER_CACHE_MS = 10 * 60 * 1000;
const ownerCache = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map(s => s.trim());
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      if (url.pathname === "/track" && request.method === "POST") return await track(request, env, cors, allowed.includes(origin));
      if (url.pathname === "/stats" && request.method === "GET") return await stats(request, env, cors, url);
      return json({ error: "Not found" }, 404, cors);
    } catch (e) {
      console.error(e);
      return json({ error: "Server error" }, 500, cors);
    }
  },
};

// ---------- tracking ----------

async function track(request, env, cors, originOk) {
  const done = new Response(null, { status: 204, headers: cors });
  const ua = request.headers.get("User-Agent") || "";
  if (!originOk || BOT_UA.test(ua)) return done;

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: "Bad body" }, 400, cors); }
  const type = ["view", "click", "copy"].includes(body.type) ? body.type : null;
  if (!type) return json({ error: "Bad type" }, 400, cors);

  const cf = request.cf || {};
  const { device, browser, os } = parseUA(ua);
  const isView = type === "view";
  await env.DB.prepare(
    `INSERT INTO events (ts, type, ip, country, region, city, device, browser, os, source, link_title, link_url)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
  ).bind(
    Date.now(), type,
    request.headers.get("CF-Connecting-IP") || "unknown",
    clip(cf.country, 8), clip(cf.region, 80), clip(cf.city, 80),
    device, browser, os,
    isView ? source(body.ref, ua) : null,
    isView ? null : clip(body.title, 200),
    isView ? null : clip(body.url, 500),
  ).run();
  return done;
}

function clip(v, max) {
  return v == null || v === "" ? null : String(v).slice(0, max);
}

function parseUA(ua) {
  const device = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua)) ? "Tablet"
    : /Mobi|iPhone|iPod/i.test(ua) ? "Mobile" : "Desktop";
  const browser = /Instagram/.test(ua) ? "Instagram app"
    : /FBAN|FBAV|FB_IAB/.test(ua) ? "Facebook app"
    : /LinkedInApp/.test(ua) ? "LinkedIn app"
    : /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox|FxiOS/.test(ua) ? "Firefox"
    : /Chrome|CriOS/.test(ua) ? "Chrome"
    : /Safari/.test(ua) ? "Safari" : "Other";
  const os = /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux|CrOS/.test(ua) ? "Linux" : "Other";
  return { device, browser, os };
}

// Where a visitor came from: in-app browsers first, then the referrer's site.
function source(ref, ua) {
  if (/Instagram/.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return "Facebook";
  if (/LinkedInApp/.test(ua)) return "LinkedIn";
  if (/Snapchat/.test(ua)) return "Snapchat";
  let host = "";
  try { host = new URL(ref).hostname.replace(/^(www|m|l|lm|mobile)\./, ""); } catch {}
  if (!host) return "Direct";
  const known = [
    [/instagram\.com$/, "Instagram"], [/facebook\.com$|fb\.com$/, "Facebook"],
    [/^t\.co$|twitter\.com$|^x\.com$/, "X (Twitter)"], [/linkedin\.com$|lnkd\.in$/, "LinkedIn"],
    [/youtube\.com$|youtu\.be$/, "YouTube"], [/google\./, "Google"], [/bing\.com$/, "Bing"],
    [/github\.com$/, "GitHub"], [/whatsapp\.com$/, "WhatsApp"], [/^t\.me$|telegram\.org$/, "Telegram"],
  ];
  for (const [re, name] of known) if (re.test(host)) return name;
  return host.slice(0, 100);
}

// ---------- stats ----------

async function stats(request, env, cors, url) {
  if (!(await isOwner(request, env))) return json({ error: "Unauthorized" }, 401, cors);

  const days = clampInt(url.searchParams.get("days"), 0, 3650, 7); // 0 = all time
  const tz = clampInt(url.searchParams.get("tz"), -840, 840, 0);    // Date#getTimezoneOffset() minutes
  const shift = tz * 60;                                             // seconds: local = utc - shift
  const since = days ? startOfLocalDay(Date.now(), tz) - (days - 1) * DAY : 0;
  const hourly = days === 1;

  const q = (sql, ...params) => env.DB.prepare(sql).bind(since, ...params);
  const bucket = hourly ? "strftime('%H', ts / 1000 - ?2, 'unixepoch')" : "date(ts / 1000 - ?2, 'unixepoch')";
  const [totals, series, links, visitors, sources, countries, devices, browsers, systems, recent, first] = await env.DB.batch([
    q(`SELECT COALESCE(SUM(type = 'view'), 0) AS views,
              COUNT(DISTINCT CASE WHEN type = 'view' THEN ip END) AS visitors,
              COALESCE(SUM(type = 'click'), 0) AS clicks,
              COALESCE(SUM(type = 'copy'), 0) AS copies
       FROM events WHERE ts >= ?1`),
    q(`SELECT ${bucket} AS bucket, SUM(type = 'view') AS views,
              COUNT(DISTINCT CASE WHEN type = 'view' THEN ip END) AS visitors, SUM(type = 'click') AS clicks
       FROM events WHERE ts >= ?1 GROUP BY bucket ORDER BY bucket`, shift),
    q(`SELECT link_url AS url, MAX(link_title) AS title, SUM(type = 'click') AS clicks, SUM(type = 'copy') AS copies,
              COUNT(DISTINCT ip) AS people, MAX(ts) AS last
       FROM events WHERE ts >= ?1 AND type IN ('click', 'copy') GROUP BY link_url ORDER BY clicks DESC, copies DESC`),
    q(`SELECT ip, SUM(type = 'view') AS views, SUM(type = 'click') AS clicks, MIN(ts) AS first, MAX(ts) AS last,
              MAX(country) AS country, MAX(city) AS city, MAX(device) AS device, MAX(browser) AS browser, MAX(os) AS os,
              GROUP_CONCAT(DISTINCT CASE WHEN type = 'click' THEN link_title END) AS clicked
       FROM events WHERE ts >= ?1 GROUP BY ip ORDER BY views DESC, clicks DESC, last DESC LIMIT 200`),
    q(`SELECT source AS name, COUNT(*) AS views FROM events WHERE ts >= ?1 AND type = 'view' GROUP BY source ORDER BY views DESC LIMIT 12`),
    q(`SELECT country AS name, COUNT(DISTINCT ip) AS visitors FROM events WHERE ts >= ?1 AND type = 'view' GROUP BY country ORDER BY visitors DESC LIMIT 12`),
    q(`SELECT device AS name, COUNT(DISTINCT ip) AS visitors FROM events WHERE ts >= ?1 AND type = 'view' GROUP BY device ORDER BY visitors DESC`),
    q(`SELECT browser AS name, COUNT(DISTINCT ip) AS visitors FROM events WHERE ts >= ?1 AND type = 'view' GROUP BY browser ORDER BY visitors DESC LIMIT 8`),
    q(`SELECT os AS name, COUNT(DISTINCT ip) AS visitors FROM events WHERE ts >= ?1 AND type = 'view' GROUP BY os ORDER BY visitors DESC LIMIT 8`),
    q(`SELECT ts, type, ip, country, city, device, browser, link_title AS title FROM events WHERE ts >= ?1 ORDER BY ts DESC LIMIT 100`),
    q(`SELECT MIN(ts) AS first FROM events WHERE ts >= ?1`),
  ]);

  return json({
    range: { days, since, until: Date.now(), hourly, firstEvent: first.results[0]?.first ?? null },
    totals: totals.results[0],
    series: series.results,
    links: links.results,
    visitors: visitors.results,
    sources: sources.results,
    countries: countries.results,
    devices: devices.results,
    browsers: browsers.results,
    systems: systems.results,
    recent: recent.results,
  }, 200, cors);
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function startOfLocalDay(now, tz) {
  const local = now - tz * 60000;
  return Math.floor(local / DAY) * DAY + tz * 60000;
}

async function isOwner(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (env.DEV_STATS_KEY && token === env.DEV_STATS_KEY) return true; // local `wrangler dev` only (.dev.vars)

  const key = await sha256(token);
  if ((ownerCache.get(key) || 0) > Date.now()) return true;

  const gh = path => fetch("https://api.github.com" + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "links-stats-worker" },
  });
  const [userRes, repoRes] = await Promise.all([gh("/user"), gh("/repos/" + env.GITHUB_REPO)]);
  const owners = env.OWNERS.split(",").map(s => s.trim().toLowerCase());
  let ok = false;
  if (userRes.ok) ok = owners.includes(String((await userRes.json()).login).toLowerCase());
  if (!ok && repoRes.ok) {
    const repo = await repoRes.json();
    ok = !!(repo.permissions && (repo.permissions.push || repo.permissions.admin));
  }
  if (ok) ownerCache.set(key, Date.now() + OWNER_CACHE_MS);
  return ok;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
