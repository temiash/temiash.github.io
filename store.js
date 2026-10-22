"use strict";
/* ======================================================================
   1. CONFIG: the only block you need to edit
   ====================================================================== */
const REPO = { user: "YOUR_USER", repo: "YOUR_REPO", branch: "main" };   // the only line to edit: your GitHub repository
// raw.githubusercontent refreshes in ~5 min (admin edits go live fast); jsDelivr is the backup CDN.
const srcs = f => [`https://raw.githubusercontent.com/${REPO.user}/${REPO.repo}/${REPO.branch}/data/${f}`, `https://cdn.jsdelivr.net/gh/${REPO.user}/${REPO.repo}@${REPO.branch}/data/${f}`, `data/${f}`];   // last resort: same-origin copy (GitHub Pages)
const CONFIG = {
  SOURCES: srcs("addons.json"),
  CACHE_KEY: "bv_addons_v3", CACHE_TTL: 5 * 60 * 1000,  // 5 min browser cache
  PAGE_SIZE: 12, NATIVE_AD_EVERY: 6,
  SUBMIT_URL: "https://github.com/YOUR_USER/YOUR_REPO/issues/new", CONTACT: "legal@YOUR_DOMAIN",
  WALL_SECONDS: 5,          // countdown length (also the simulated ad length)
  FAIL_OPEN_AFTER: 30,      // if a real ad never ends/blocked, unlock after N seconds
  LIVE_ADS: false,          // false = simulated video ad + no ad network calls
  ADS: {
    adsenseClient: "ca-pub-XXXXXXXXXXXXXXXX", nativeSlot: "0000000000",
    gam: { top: "/NETWORK_ID/top_728x90", side1: "/NETWORK_ID/side_300x250", side2: "/NETWORK_ID/side_300x600", anchor: "/NETWORK_ID/anchor_728x90" }
  }
};
const CATEGORIES = { all: "All categories", addon: "Addons", mod: "Mods", texture: "Texture packs", map: "Maps", skin: "Skins", shader: "Shaders" };
const ICON = { addon: "🧩", mod: "⚙️", texture: "🎨", map: "🗺️", skin: "🧑‍🎤", shader: "✨" };

/* ======================================================================
   2. HELPERS
   ====================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K" : String(n);
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";   // blocks javascript: URLs from remote JSON
const tmo = ms => (AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);
const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
const stars = r => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));

/* ======================================================================
   3. DATA LAYER: GitHub repo as a JSON API (CDN -> raw GitHub -> cache -> embedded)
   ====================================================================== */
function normalize(j) {
  return (Array.isArray(j) ? j : (j && j.addons) || []).filter(a => a && a.id && a.title).map(a => ({
    id: String(a.id), title: String(a.title), author: a.author || "Unknown", version: a.version || "1.0", mc: a.mc || "",
    category: CATEGORIES[a.category] ? a.category : "addon", downloads: +a.downloads || 0,
    rating: Math.max(0, Math.min(5, +a.rating || 0)), tags: (a.tags || []).slice(0, 3), verified: !!a.verified,
    edition: a.edition === "java" || a.edition === "bedrock" ? a.edition : (a.category === "mod" ? "java" : "bedrock"),
    desc: a.description || "", content: a.content || "", changelog: (a.changelog || []).slice(0, 5).map(String), featured: !!a.featured,
    updated: a.updated || "", thumb: safeUrl(a.thumb), download: safeUrl(a.download)
  }));
}
const cache = {
  read() { try { return JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY)); } catch (e) { return null; } },
  write(d) { try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ t: Date.now(), d })); } catch (e) {} }
};
async function loadAddons() {
  const c = cache.read();
  if (c && Date.now() - c.t < CONFIG.CACHE_TTL) return c.d;
  for (const url of CONFIG.SOURCES) {
    try {
      const r = await fetch(url, { signal: tmo(4000) });
      if (!r.ok) continue;
      const d = normalize(await r.json());
      if (d.length) { cache.write(d); return d; }
    } catch (e) { /* try next source */ }
  }
  return c ? c.d : normalize(JSON.parse($("#fallback").textContent));
}

/* ======================================================================
   4. AD LAYER
   ====================================================================== */
/* ======================================================================
   BLOG + MICROBLOG: data/posts.json (written by the dashboard)
   ====================================================================== */
const imgOk = u => /^(https?:\/\/|media\/)/i.test(u || "") ? u : "";
const live = p => p.status === "published" && (!p.date || new Date(p.date) <= new Date());   // scheduled posts go live by themselves
const readTime = t => Math.max(1, Math.round(String(t).split(/\s+/).length / 200));
const fdate = d => d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
async function loadPosts() {
  for (const url of srcs("posts.json")) {
    try {
      const r = await fetch(url, { signal: tmo(4000) }); if (!r.ok) continue;
      return ((await r.json()).posts || []).filter(p => p && p.content && (p.slug || p.id)).map(p => ({
        type: p.type === "note" ? "note" : "post", title: String(p.title || ""), slug: String(p.slug || p.id), content: String(p.content), tags: (p.tags || []).slice(0, 5).map(String),
        excerpt: p.excerpt || String(p.content).replace(/[#*_`>\[\]()!-]/g, "").slice(0, 160), status: p.status || "draft", date: p.date || "", pinned: !!p.pinned, image: imgOk(p.image) }));
    } catch (e) { /* next source */ }
  }
  return [];
}
function renderFeed() {
  const l = S.posts.filter(live).sort((a, b) => (b.pinned | 0) - (a.pinned | 0) || ((+new Date(b.date) || 0) - (+new Date(a.date) || 0)));
  const tags = [...new Set(l.flatMap(p => p.tags))].sort();
  $("#feed").classList.toggle("hidden", !l.length);
  $("#feedTags").innerHTML = ["all", ...tags].map(t => `<button class="ghost" data-tag="${esc(t)}" aria-pressed="${S.tag === t}">${t === "all" ? "All" : "#" + esc(t)}</button>`).join("");
  $("#feedList").innerHTML = l.filter(p => S.tag === "all" || p.tags.includes(S.tag)).map(p => p.type === "note"
    ? `<article class="card glass p-4"><div class="text-xs text-gray-400 mb-2">${p.pinned ? "Pinned, " : ""}${fdate(p.date)}</div><div class="md">${md(p.content)}</div></article>`
    : `<article class="card glass overflow-hidden">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" class="w-full h-40 object-cover">` : ""}<div class="p-4"><div class="text-xs text-gray-400">${p.pinned ? "Pinned, " : ""}${fdate(p.date)}, ${readTime(p.content)} min read</div>
      <h3 class="font-bold text-lg mt-1"><a href="#/post/${encodeURIComponent(p.slug)}" class="hover:text-[#00ff66]">${esc(p.title)}</a></h3><p class="text-sm text-gray-400 mt-1">${esc(p.excerpt)}</p></div></article>`).join("");
}
function mountComments(slug) {   // GitHub Discussions comments through giscus (set in dashboard settings)
  const g = CONFIG.GISCUS; if (!g || !g.repo || !$("#giscus")) return;
  const s = document.createElement("script");
  Object.entries({ src: "https://giscus.app/client.js", "data-repo": g.repo, "data-repo-id": g.repoId, "data-category": g.cat, "data-category-id": g.catId, "data-mapping": "specific", "data-term": slug, "data-theme": "dark", crossorigin: "anonymous" }).forEach(([k, v]) => s.setAttribute(k, v));
  s.async = true; $("#giscus").append(s);
}
async function loadPages() {
  for (const url of srcs("pages.json")) {
    try { const r = await fetch(url, { signal: tmo(4000) }); if (r.ok) return ((await r.json()).pages || []).filter(p => p && p.slug && p.title); } catch (e) { /* next source */ }
  }
  return [];
}
function renderPages() {
  const f = S.pages.filter(p => p.footer !== false);
  $("#footLinks").innerHTML = f.map(p => `<a class="underline hover:text-white" href="#/page/${encodeURIComponent(p.slug)}">${esc(p.title)}</a>`).join("");
}
async function loadSettings() {
  for (const url of srcs("config.json")) {
    try { const r = await fetch(url, { signal: tmo(4000) }); if (r.ok) return await r.json(); } catch (e) { /* try next source */ }
  }
  return {};
}
function applySettings(c) {
  const map = { wallSeconds: "WALL_SECONDS", failOpenAfter: "FAIL_OPEN_AFTER", nativeAdEvery: "NATIVE_AD_EVERY", pageSize: "PAGE_SIZE", liveAds: "LIVE_ADS", submitUrl: "SUBMIT_URL", contact: "CONTACT" };
  for (const k in map) if (c[k] !== undefined && c[k] !== "") CONFIG[map[k]] = typeof CONFIG[map[k]] === "number" ? (+c[k] || CONFIG[map[k]]) : c[k];
  if (c.adsenseClient) CONFIG.ADS.adsenseClient = c.adsenseClient;
  if (c.nativeSlot) CONFIG.ADS.nativeSlot = c.nativeSlot;
  [["gamTop", "top"], ["gamSide1", "side1"], ["gamSide2", "side2"], ["gamAnchor", "anchor"]].forEach(([k, g]) => { if (c[k]) CONFIG.ADS.gam[g] = c[k]; });
  S.shown = CONFIG.PAGE_SIZE;
  if (c.siteName) { $("#siteName").textContent = c.siteName; document.title = DOC_TITLE = c.siteName; }
  if (c.giscusRepo) CONFIG.GISCUS = { repo: c.giscusRepo, repoId: c.giscusRepoId, cat: c.giscusCategory, catId: c.giscusCategoryId };
  const items = (c.menu || "Addons | #store\nNews | #feed").split("\n").map(l => l.split("|").map(x => x.trim())).filter(x => x[0] && /^(#|https?:\/\/)/.test(x[1] || ""));
  $("#menu").innerHTML = items.map(([l, u]) => `<a class="hover:text-white" href="${esc(u)}">${esc(l)}</a>`).join("");
  if (c.heroTitle) $("#heroH1").textContent = c.heroTitle;
  if (c.heroText) $("#heroP").textContent = c.heroText;
  if (c.announcement) { $("#announce").textContent = c.announcement; $("#announce").classList.remove("hidden"); }
  if (c.maintenance && !/preview=1/.test(location.search)) { $("#maint").classList.remove("hidden"); $("#maint").classList.add("grid"); }
}

const Ads = {
  initGAM() {                                   // Google Ad Manager display slots
    if (!CONFIG.LIVE_ADS) return;
    window.googletag = window.googletag || { cmd: [] };
    googletag.cmd.push(() => {
      const g = CONFIG.ADS.gam; googletag.pubads().setRequestNonPersonalizedAds(Ads.npa ? 1 : 0);
      [[g.top, [728, 90], "gpt-top"], [g.side1, [300, 250], "gpt-side-1"], [g.side2, [300, 600], "gpt-side-2"], [g.anchor, [[320, 50], [728, 90]], "gpt-anchor"]]
        .forEach(([path, size, id]) => { const s = googletag.defineSlot(path, size, id); if (s) s.addService(googletag.pubads()); });
      googletag.enableServices();
      ["gpt-top", "gpt-side-1", "gpt-side-2", "gpt-anchor"].forEach(id => googletag.display(id));
    });
  },
  fillNative() {                                // in-feed native units
    if (!CONFIG.LIVE_ADS) return;
    if (!this.ready) return;
    window.adsbygoogle = window.adsbygoogle || []; window.adsbygoogle.requestNonPersonalizedAds = this.npa ? 1 : 0;
    document.querySelectorAll("ins.adsbygoogle:not([data-done])").forEach(el => {
      el.dataset.done = 1;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    });
  },
  /* Rewarded / pre-roll video. cb = { onStart, onEnd, onError }.
     Simulated by default. For production: replace the else-branch with the AppLixir / Playwire
     snippet, render into `el`, and call cb.onStart() on play, cb.onEnd() on completion (adEnd),
     cb.onError() on failure or ad-block. */
  showVideo(el, cb) {
    if (CONFIG.LIVE_ADS) {
      /* === PASTE APPLIXIR / PLAYWIRE INVOCATION HERE === */
      return;
    }
    el.innerHTML = `<div class="absolute inset-0 grid place-items-center" style="background:linear-gradient(120deg,#0b1f14,#0b1020,#1c0b20);background-size:300% 300%">
      <div class="text-center"><div class="text-4xl">▶</div><div class="text-sm text-gray-300 mt-2">Simulated video ad</div></div></div>`;
    cb.onStart();
    this._t = setTimeout(cb.onEnd, CONFIG.WALL_SECONDS * 1000);
  },
  start() { this.npa = Consent.get() === "npa"; this.ready = true; this.initGAM(); this.fillNative(); },
  stop(el) { clearTimeout(this._t); el.innerHTML = ""; }
};

/* ======================================================================
   5. STOREFRONT: state, cards, filters
   ====================================================================== */
const S = { all: [], q: "", cat: "all", sort: "popular", shown: CONFIG.PAGE_SIZE, ed: "all", ver: "all", vonly: false, saved: false, tag: "all", posts: [] };
const SORT = {
  popular: (a, b) => b.downloads - a.downloads,
  rating: (a, b) => b.rating - a.rating || b.downloads - a.downloads,
  newest: (a, b) => (a.updated < b.updated ? 1 : -1)
};

function cardHTML(a) {
  const h = hue(a.id);
  return `<article class="card glass overflow-hidden flex flex-col">
    <div class="relative h-36 grid place-items-center text-5xl" style="background:linear-gradient(135deg,hsl(${h} 65% 20%),hsl(${(h + 60) % 360} 70% 9%))">
      <span>${ICON[a.category]}</span>
      <button data-fav="${esc(a.id)}" aria-pressed="${Favs.s.has(a.id)}" aria-label="Save" class="absolute top-2 left-2 w-8 h-8 rounded bg-black/60 text-lg ${Favs.s.has(a.id) ? "text-[#00ff66]" : "text-gray-400"}">♥</button>
      ${a.thumb ? `<img src="${esc(a.thumb)}" alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover">` : ""}
      ${a.verified ? `<span class="absolute top-2 right-2 text-xs px-2 py-0.5 rounded bg-black/60 text-[#00ff66] border border-[#00ff66]/40">Verified</span>` : ""}
    </div>
    <div class="p-4 flex flex-col gap-2 flex-1">
      <h3 class="font-bold text-lg leading-snug"><button data-open="${esc(a.id)}" class="text-left hover:text-[#00ff66]">${esc(a.title)}</button></h3>
      <p class="text-sm text-gray-400">by ${esc(a.author)}, v${esc(a.version)}${a.mc ? `, Minecraft ${esc(a.mc)}` : ""}</p>
      <div class="flex items-center justify-between text-sm">
        <span class="text-yellow-400" title="${a.rating.toFixed(1)} out of 5">${stars(a.rating)} <span class="text-gray-400">${a.rating.toFixed(1)}</span></span>
        <span class="text-gray-300">${fmt(a.downloads)} downloads</span>
      </div>
      <div class="flex flex-wrap gap-1.5">${a.tags.map(t => `<span class="text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">${esc(t)}</span>`).join("")}</div>
      <button class="btn mt-auto" data-dl="${esc(a.id)}">Download addon</button>
    </div></article>`;
}

/* Native ad card: same footprint as a mod card so it blends into the grid, clearly labelled */
function nativeAdHTML() {
  return `<aside class="card glass overflow-hidden flex flex-col" aria-label="Sponsored">
    <div class="relative h-36 slot"><span>Sponsored content loads here</span>
      <ins class="adsbygoogle" style="display:block;position:absolute;inset:0" data-ad-format="fluid" data-ad-layout-key="-XXXXXXXX"
           data-ad-client="${CONFIG.ADS.adsenseClient}" data-ad-slot="${CONFIG.ADS.nativeSlot}"></ins></div>
    <div class="p-4 flex flex-col gap-2 flex-1">
      <span class="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300 self-start">Sponsored</span>
      <p class="text-sm text-gray-400">This space is reserved for a native in-feed ad.</p>
    </div></aside>`;
}

function render() {
  const q = S.q.toLowerCase();
  const list = S.all.filter(a => (S.cat === "all" || a.category === S.cat) && (S.ed === "all" || a.edition === S.ed) && (S.ver === "all" || a.mc === S.ver || a.mc === "any") && (!S.vonly || a.verified) && (!S.saved || Favs.s.has(a.id)) && (!q || (a.title + " " + a.author + " " + a.tags.join(" ")).toLowerCase().includes(q))).sort(SORT[S.sort]);
  const page = list.slice(0, S.shown);
  $("#listTitle").textContent = `${CATEGORIES[S.cat]} (${list.length})`;
  $("#grid").innerHTML = page.length
    ? page.map((a, i) => cardHTML(a) + ((i + 1) % CONFIG.NATIVE_AD_EVERY === 0 ? nativeAdHTML() : "")).join("")
    : `<p class="col-span-full text-gray-400 py-12 text-center">No addons match "${esc(S.q)}". Try a different word or category.</p>`;
  $("#more").classList.toggle("hidden", list.length <= S.shown);
  Ads.fillNative();
}

function renderStats() {
  const v = { downloads: S.all.reduce((s, a) => s + a.downloads, 0), verified: S.all.filter(a => a.verified).length, total: S.all.length };
  const still = matchMedia("(prefers-reduced-motion:reduce)").matches;
  document.querySelectorAll("[data-count]").forEach(el => {
    const end = v[el.dataset.count], t0 = performance.now(), big = end >= 1000;
    const tick = now => {
      const p = still ? 1 : Math.min(1, (now - t0) / 1200), n = Math.round(end * (1 - Math.pow(1 - p, 3)));
      el.textContent = big ? fmt(n) : n; if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function setCategory(c) {
  S.cat = c; S.shown = CONFIG.PAGE_SIZE; $("#catMenu").open = false;
  $("#catList").innerHTML = Object.entries(CATEGORIES).map(([k, l]) =>
    `<button data-cat="${k}" class="block w-full text-left px-3 py-2 rounded text-sm hover:bg-white/10 ${k === c ? "text-[#00ff66]" : ""}">${l}</button>`).join("");
  render();
}

/* ======================================================================
   6. SMART DOWNLOAD WALL
   ====================================================================== */
const Wall = {
  el: $("#wall"), ad: $("#video-ad-container"), btn: $("#dlNow"),
  open(a) {
    this.a = a; this.done = false;
    $("#wallTitle").textContent = a.title; $("#wallMeta").textContent = `v${a.version} by ${a.author}`;
    $("#bar").style.width = "0"; this.lock("Your download unlocks after this short ad.");
    this.el.classList.replace("hidden", "flex"); $("#wallX").focus();
    Ads.showVideo(this.ad, { onStart: () => this.start(), onEnd: () => this.unlock(), onError: () => this.unlock(true) });
    this.guard = setTimeout(() => this.unlock(true), CONFIG.FAIL_OPEN_AFTER * 1000); // ad blocked or stalled
  },
  start() {
    const t0 = Date.now();
    this.tick = setInterval(() => {
      const el = (Date.now() - t0) / 1000, left = Math.max(0, Math.ceil(CONFIG.WALL_SECONDS - el));
      $("#bar").style.width = Math.min(100, el / CONFIG.WALL_SECONDS * 100) + "%";
      $("#wallMsg").textContent = left ? `Download unlocks in ${left}s` : "Almost there...";
    }, 100);
  },
  lock(msg) { this.btn.textContent = "Download locked"; this.btn.setAttribute("aria-disabled", "true"); this.btn.tabIndex = -1; this.btn.removeAttribute("href"); $("#wallMsg").textContent = msg; },
  unlock(skipped) {                              // equivalent of the ad network's adEnd callback
    if (this.done || !this.a) return;
    this.done = true; clearInterval(this.tick); clearTimeout(this.guard); $("#bar").style.width = "100%";
    if (!this.a.download) { $("#wallMsg").textContent = "This file has no download link yet. Please try again later."; return; }
    this.btn.href = this.a.download; this.btn.setAttribute("download", ""); this.btn.setAttribute("aria-disabled", "false"); this.btn.tabIndex = 0;
    this.btn.textContent = "Download now"; $("#wallMsg").textContent = skipped ? "Ad unavailable. Your download is ready." : "Thanks for supporting free mods. Your download is ready.";
    this.btn.focus();
    window.dispatchEvent(new CustomEvent("bv:download", { detail: this.a }));   // hook for analytics
  },
  close() { clearInterval(this.tick); clearTimeout(this.guard); Ads.stop(this.ad); this.a = null; this.el.classList.replace("flex", "hidden"); }
};
$("#dlNow").addEventListener("click", e => { if ($("#dlNow").getAttribute("aria-disabled") === "true") e.preventDefault(); });

/* ======================================================================
   7. EVENTS + BOOT
   ====================================================================== */
/* ---- Favourites (saved in this browser) ---- */
const Favs = {
  s: new Set((() => { try { return JSON.parse(localStorage.getItem("bv_favs")) || []; } catch (e) { return []; } })()),
  toggle(id) { this.s.has(id) ? this.s.delete(id) : this.s.add(id); try { localStorage.setItem("bv_favs", JSON.stringify([...this.s])); } catch (e) {} }
};

/* ---- Ad consent gate: no ad calls until the visitor chooses ---- */
const Consent = {
  get() { try { return localStorage.getItem("bv_consent"); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem("bv_consent", v); } catch (e) {} $("#consent").classList.add("hidden"); Ads.start(); },
  init() { this.get() ? Ads.start() : $("#consent").classList.remove("hidden"); }
};

/* ---- Detail drawer with shareable URLs (#/addon/<id>) ---- */
let DOC_TITLE = document.title;
const Detail = {
  el: $("#drawer"),
  go(id) { location.hash = "/addon/" + encodeURIComponent(id); },
  close() { if (location.hash) history.pushState(null, "", location.pathname + location.search); this.hide(); },
  hide() { this.el.classList.add("hidden"); document.title = DOC_TITLE; },
  showPost(p) {
    const first = this.el.classList.contains("hidden"), t = p.title || "Note";
    $("#dTitle").textContent = t;
    $("#dBody").innerHTML = `<p class="text-xs text-gray-400">${fdate(p.date)}, ${readTime(p.content)} min read${p.tags.length ? ", " + p.tags.map(x => "#" + esc(x)).join(" ") : ""}</p>${p.image ? `<img src="${esc(p.image)}" alt="" class="w-full rounded">` : ""}<div class="md">${md(p.content)}</div><div id="giscus"></div>`;
    this.el.classList.remove("hidden"); document.title = t + " | " + DOC_TITLE; if (first) $("#dX").focus(); mountComments(p.slug);
  },
  showPage(p) {   // CMS pages written in Markdown (data/pages.json)
    const first = this.el.classList.contains("hidden");
    $("#dTitle").textContent = p.title; $("#dBody").innerHTML = `<div class="md">${md(p.content)}</div>`;
    this.el.classList.remove("hidden"); document.title = p.title + " | " + DOC_TITLE; if (first) $("#dX").focus();
  },
  route() {
    const m = location.hash.match(/^#\/addon\/(.+)$/), a = m && S.all.find(x => x.id === decodeURIComponent(m[1]));
    const pm = location.hash.match(/^#\/page\/(.+)$/), pg = pm && (S.pages || []).find(x => x.slug === decodeURIComponent(pm[1]));
    if (pg) return this.showPage(pg);
    const om = location.hash.match(/^#\/post\/(.+)$/), po = om && S.posts.filter(live).find(x => x.slug === decodeURIComponent(om[1]));
    if (po) return this.showPost(po);
    a ? this.show(a) : this.hide();
  },
  show(a) {
    const first = this.el.classList.contains("hidden");
    $("#dTitle").textContent = a.title;
    $("#dBody").innerHTML = `
      <p class="text-sm text-gray-400">by ${esc(a.author)}, v${esc(a.version)}, ${a.edition === "java" ? "Java" : "Bedrock"} Edition${a.mc ? `, Minecraft ${esc(a.mc)}` : ""}</p>
      <div class="flex justify-between text-sm"><span class="text-yellow-400">${stars(a.rating)} ${a.rating.toFixed(1)}</span><span>${fmt(a.downloads)} downloads</span></div>
      <div class="md">${a.content ? md(a.content) : `<p>${esc(a.desc || "The author has not added a description yet.")}</p>`}</div>
      ${a.changelog.length ? `<div><h3 class="font-bold mb-1">What's new</h3><ul class="list-disc pl-5 text-sm text-gray-300 space-y-1">${a.changelog.map(c => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
      <div class="flex flex-wrap gap-1.5">${a.tags.map(t => `<span class="text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">${esc(t)}</span>`).join("")}</div>
      <div class="flex gap-2"><button class="btn flex-1" data-dl="${esc(a.id)}">Download addon</button>
        <button class="ghost ${Favs.s.has(a.id) ? "text-[#00ff66]" : ""}" data-fav="${esc(a.id)}" aria-label="Save">♥</button><button class="ghost" id="dShare">Copy link</button></div>
      <a class="text-xs text-gray-500 underline" href="mailto:${esc(CONFIG.CONTACT)}?subject=${encodeURIComponent("Report: " + a.title)}">Report this file or request removal</a>`;
    this.el.classList.remove("hidden"); document.title = a.title + " | BlockVault"; if (first) $("#dX").focus();
  }
};
addEventListener("hashchange", () => Detail.route());

function buildVersions() {
  const v = [...new Set(S.all.map(a => a.mc).filter(m => m && m !== "any"))].sort().reverse();
  $("#ver").innerHTML = `<option value="all">All versions</option>` + v.map(m => `<option>${esc(m)}</option>`).join("");
}
function setFilters() {
  document.querySelectorAll("[data-ed]").forEach(b => b.setAttribute("aria-pressed", b.dataset.ed === S.ed));
  $("#savedBtn").setAttribute("aria-pressed", S.saved); $("#savedN").textContent = Favs.s.size;
}
function renderFeatured() {
  const f = S.all.filter(a => a.featured), t = (f.length ? f : [...S.all].sort(SORT.popular)).slice(0, 6);
  $("#trendWrap").classList.toggle("hidden", !t.length);
  $("#trend").innerHTML = t.map(a => { const h = hue(a.id);
    return `<button data-open="${esc(a.id)}" class="card glass shrink-0 w-56 p-3 text-left" style="background-image:linear-gradient(135deg,hsl(${h} 65% 16% / .8),transparent)"><div class="text-3xl">${ICON[a.category]}</div><div class="font-bold mt-2 truncate">${esc(a.title)}</div><div class="text-xs text-gray-400">${fmt(a.downloads)} downloads</div></button>`; }).join("");
}

let timer;
$("#q").addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(() => { S.q = e.target.value.trim(); S.shown = CONFIG.PAGE_SIZE; render(); }, 200); });
$("#sort").addEventListener("change", e => { S.sort = e.target.value; render(); });
$("#more").addEventListener("click", () => { S.shown += CONFIG.PAGE_SIZE; render(); });
$("#ver").addEventListener("change", e => { S.ver = e.target.value; S.shown = CONFIG.PAGE_SIZE; render(); });
$("#ver-only").addEventListener("change", e => { S.vonly = e.target.checked; S.shown = CONFIG.PAGE_SIZE; render(); });
$("#dX").addEventListener("click", () => Detail.close());
$("#dBack").addEventListener("click", () => Detail.close());
document.addEventListener("click", e => {          // one delegated handler for all in-page actions
  const t = e.target.closest("[data-dl],[data-ed],[data-open],[data-fav],[data-consent],#savedBtn,#dShare"); if (!t) return;
  if (t.dataset.dl) { Wall.open(S.all.find(a => a.id === t.dataset.dl)); return; }
  if (t.dataset.open) { Detail.go(t.dataset.open); return; }
  if (t.dataset.consent) { Consent.set(t.dataset.consent); return; }
  if (t.id === "dShare") { navigator.clipboard && navigator.clipboard.writeText(location.href).then(() => { t.textContent = "Copied"; }).catch(() => {}); return; }
  if (t.dataset.ed) S.ed = t.dataset.ed; else if (t.dataset.fav) Favs.toggle(t.dataset.fav); else S.saved = !S.saved;
  if (!t.dataset.fav) S.shown = CONFIG.PAGE_SIZE;
  setFilters(); render(); if (!$("#drawer").classList.contains("hidden")) Detail.route();
});
$("#grid").addEventListener("error", e => { if (e.target.tagName === "IMG") e.target.remove(); }, true);
document.addEventListener("click", e => { const c = e.target.closest("[data-cat]"); if (c) { setCategory(c.dataset.cat); } });
$("#wallX").addEventListener("click", () => Wall.close());
$("#wall").addEventListener("click", e => { if (e.target === $("#wall")) Wall.close(); });
$("#anchorX").addEventListener("click", () => $("#anchor").remove());
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { if (Wall.a) Wall.close(); else if (!$("#drawer").classList.contains("hidden")) Detail.close(); }
  if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("#q").focus(); }
});

(async function boot() {
  $("#grid").innerHTML = Array.from({ length: 6 }, () => `<div class="sk h-72 rounded"></div>`).join("");   // skeletons
  setCategory("all");
  const [cfg, data, pages, posts] = await Promise.all([loadSettings(), loadAddons(), loadPages(), loadPosts()]);
  applySettings(cfg); S.all = data; S.pages = pages; S.posts = posts; Consent.init();
  const qs = new URLSearchParams(location.search).get("q"); if (qs) { S.q = qs.trim(); $("#q").value = S.q; }
  $("#submit").href = CONFIG.SUBMIT_URL;
  buildVersions(); setFilters(); renderStats(); renderFeatured(); render(); renderPages(); renderFeed(); Detail.route();
})();

/* ======================================================================
   8. PWA: service worker + install button
   ====================================================================== */
if ("serviceWorker" in navigator && location.protocol !== "file:") addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
let deferredInstall;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; $("#install").classList.remove("hidden"); });
addEventListener("appinstalled", () => $("#install").classList.add("hidden"));
$("#install").addEventListener("click", async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $("#install").classList.add("hidden"); });

document.addEventListener("click", e => { const t = e.target.closest("[data-tag]"); if (t) { S.tag = t.dataset.tag; renderFeed(); } });
