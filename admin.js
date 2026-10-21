"use strict";
/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
const b64e = s => btoa(unescape(encodeURIComponent(s))), b64d = s => decodeURIComponent(escape(atob(s.replace(/\s/g, ""))));
const isUrl = u => /^https?:\/\//i.test(u);

/* ---------- field definitions: [key, label, type, options] ---------- */
const AF = [  // one addon
  ["title", "Title", "text"], ["id", "ID (leave empty to create from the title)", "text"], ["author", "Author", "text"], ["version", "Version", "text"],
  ["mc", "Minecraft version (or any)", "text"], ["category", "Category", "select", ["addon", "mod", "texture", "map", "skin", "shader"]],
  ["edition", "Edition", "select", ["bedrock", "java"]], ["downloads", "Downloads", "number"], ["rating", "Rating (0 to 5)", "number"], ["tags", "Tags (comma separated, max 3)", "text"],
  ["thumb", "Thumbnail image URL", "text"], ["download", "Download URL", "text"], ["description", "Short description (cards and search)", "textarea"], ["content", "Full description (Markdown)", "md"], ["changelog", "What's new (one line each)", "textarea"],
  ["verified", "Verified", "bool"], ["featured", "Featured on the home page", "bool"]];
const PF = [["title", "Title", "text"], ["slug", "URL slug (empty = from the title)", "text"], ["footer", "Show a link in the site footer", "bool"], ["content", "Content (Markdown)", "md"]];
const TITLES = { dash: "Dashboard", addons: "Addons", pages: "Pages", config: "Site settings and ads", raw: "Raw JSON", history: "History and restore" };
const MDB = [["B", "Bold", "**", "**"], ["I", "Italic", "*", "*"], ["H2", "Heading", "\n## ", ""], ["•", "List", "\n- ", ""], ["❝", "Quote", "\n> ", ""], ["</>", "Code", "`", "`"], ["Link", "Link", "[", "](https://)"], ["Img", "Image", "![", "](https://)"], ["—", "Divider", "\n\n---\n", ""]];
const CF = [  // site settings (data/config.json)
  ["siteName", "Site name", "text"], ["heroTitle", "Home page headline", "text"], ["heroText", "Home page text", "textarea"], ["announcement", "Announcement bar (empty = hidden)", "text"],
  ["maintenance", "Maintenance mode (visitors see a pause page)", "bool"], ["wallSeconds", "Download wall length (seconds)", "number"], ["failOpenAfter", "Unlock anyway if the ad fails after (seconds)", "number"],
  ["nativeAdEvery", "Native ad after every N cards", "number"], ["pageSize", "Cards per page", "number"], ["liveAds", "Live ads (off = simulated ads)", "bool"],
  ["adsenseClient", "AdSense client ID (ca-pub-...)", "text"], ["nativeSlot", "AdSense native slot ID", "text"], ["gamTop", "Ad Manager unit: top banner", "text"],
  ["gamSide1", "Ad Manager unit: sidebar 300x250", "text"], ["gamSide2", "Ad Manager unit: sidebar 300x600", "text"], ["gamAnchor", "Ad Manager unit: anchor banner", "text"],
  ["submitUrl", "Submit-addon link", "text"], ["contact", "Takedown contact email", "text"]];

/* ---------- state ---------- */
let gh = null, tab = "dash", q = "", editing = -1;
const F = { addons: { path: "data/addons.json", data: [], sha: null, orig: "" }, config: { path: "data/config.json", data: {}, sha: null, orig: "" }, pages: { path: "data/pages.json", data: [], sha: null, orig: "" } };
const LIST = { addons: 1, pages: 1 };   // files that hold a list
const ser = k => JSON.stringify(LIST[k] ? { [k]: F[k].data } : F[k].data, null, 1);
const dirty = k => ser(k) !== F[k].orig;

/* ---------- GitHub API ---------- */
const api = (p, o = {}) => fetch(`https://api.github.com/repos/${gh.o}/${gh.r}/${p}`, { ...o, headers: { Authorization: "Bearer " + gh.t, Accept: "application/vnd.github+json", ...o.headers } });
async function loadFile(k, ref) {
  const f = F[k], r = await api(`contents/${f.path}?ref=${encodeURIComponent(ref || gh.b)}`);
  if (r.status === 404) { if (!ref) f.sha = null; return LIST[k] ? [] : {}; }   // file does not exist yet: it is created on first publish
  if (!r.ok) throw new Error("GitHub error " + r.status);
  const j = await r.json(); if (!ref) f.sha = j.sha;
  const d = JSON.parse(b64d(j.content));
  return LIST[k] ? (Array.isArray(d) ? d : d[k] || []) : d;
}
async function connect(g, remember) {
  gh = g; $("#lerr").textContent = "";
  try {
    const r = await api("");
    if (r.status === 401) throw new Error("GitHub rejected the token. Check that it was copied fully and has not expired.");
    if (r.status === 404) throw new Error("Repository not found, or the token cannot see it.");
    if (!r.ok) throw new Error("GitHub error " + r.status);
    if (!(await r.json()).permissions?.push) throw new Error("This token cannot write to the repository. Set Contents to Read and write.");
    for (const k of Object.keys(F)) { F[k].data = await loadFile(k); F[k].orig = ser(k); }
    (remember ? localStorage : sessionStorage).setItem("bv_gh", JSON.stringify(g)); (remember ? sessionStorage : localStorage).removeItem("bv_gh");
    $("#login").classList.add("hidden"); $("#app").classList.remove("hidden"); $("#repo").textContent = `${g.o}/${g.r} on ${g.b}`; draw();
  } catch (e) { gh = null; $("#lerr").textContent = e.message; $("#login").classList.remove("hidden"); }
}

/* ---------- rendering ---------- */
function toast(m, bad) {
  const t = $("#toast"); t.textContent = m; t.className = "fixed bottom-4 right-4 z-50 px-4 py-2 rounded text-sm " + (bad ? "bg-red-600 text-white" : "bg-[#00ff66] text-black");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = "hidden", 4000);
}
function field([k, l, t, opts], v) {
  if (t === "md") return `<div class="sm:col-span-2 text-sm">${l}<div class="mded" data-k="${k}"><div class="mdbar">${MDB.map(m => `<button type="button" class="ghost" data-md="${m[0]}" title="${m[1]}">${m[0]}</button>`).join("")}<span class="grow"></span><button type="button" class="ghost" data-md="view">Preview only</button></div>
    <div class="mdpane"><textarea class="in mdta" spellcheck="false">${esc(v ?? "")}</textarea><div class="md mdprev"></div></div></div></div>`;
  if (t === "bool") return `<label class="flex items-center gap-2 text-sm"><input type="checkbox" data-k="${k}" ${v ? "checked" : ""}> ${l}</label>`;
  const c = t === "textarea" ? `<textarea data-k="${k}" rows="3" class="in mt-1">${esc(v ?? "")}</textarea>`
    : t === "select" ? `<select data-k="${k}" class="in mt-1">${opts.map(o => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`
    : `<input data-k="${k}" type="${t}" step="any" value="${esc(v ?? "")}" class="in mt-1">`;
  return `<label class="block text-sm ${t === "textarea" ? "sm:col-span-2" : ""}">${l}${c}</label>`;
}
function readForm(root, fs) {
  const o = {};
  fs.forEach(([k, , t]) => { const e = root.querySelector(`[data-k="${k}"]`); o[k] = t === "bool" ? e.checked : t === "md" ? e.querySelector("textarea").value : t === "number" ? (e.value === "" ? "" : +e.value) : e.value.trim(); });
  return o;
}
function status() {   // stats and publish button (safe to call while typing)
  const a = F.addons.data, n = ["addons", "config"].filter(dirty).length;
  $("#stats").innerHTML = [["Addons", a.length], ["Total downloads", fmt(a.reduce((s, x) => s + (+x.downloads || 0), 0))], ["Verified", a.filter(x => x.verified).length], ["Featured", a.filter(x => x.featured).length]]
    .map(([l, v]) => `<div class="panel p-3"><div class="text-xl font-bold text-[#00ff66]">${v}</div><div class="text-xs text-gray-400">${l}</div></div>`).join("");
  $("#pub").disabled = !n; $("#pub").textContent = n ? `Publish ${n} changed file${n > 1 ? "s" : ""}` : "Nothing to publish";
}
function draw() {
  status();
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
  document.querySelectorAll("[data-pane]").forEach(p => p.classList.toggle("hidden", p.dataset.pane !== tab));
  $("#pageTitle").textContent = TITLES[tab];
  if (tab === "dash") drawDash();
  if (tab === "pages") drawPages();
  if (tab === "addons") drawTable();
  if (tab === "config") $("#cfg").innerHTML = CF.map(f => field(f, F.config.data[f[0]])).join("");
  if (tab === "raw") { $("#raw_addons").value = ser("addons"); $("#raw_config").value = ser("config"); $("#raw_pages").value = ser("pages"); }
  if (tab === "history") drawHist();
}
function drawTable() {
  const l = F.addons.data.map((a, i) => [a, i]).filter(([a]) => !q || (a.title + a.author + a.id).toLowerCase().includes(q));
  $("#rows").innerHTML = l.map(([a, i]) => `<tr><td class="font-semibold">${esc(a.title)}<div class="text-xs text-gray-500">${esc(a.id)}</div></td><td>${esc(a.category || "")}</td><td>${esc(a.version || "")}</td>
    <td>${fmt(+a.downloads || 0)}</td><td>${(+a.rating || 0).toFixed(1)}</td>
    <td><input type="checkbox" data-act="verified" data-i="${i}" ${a.verified ? "checked" : ""} aria-label="Verified"></td>
    <td><input type="checkbox" data-act="featured" data-i="${i}" ${a.featured ? "checked" : ""} aria-label="Featured"></td>
    <td class="whitespace-nowrap"><button class="ghost" data-act="edit" data-i="${i}">Edit</button> <button class="ghost" data-act="del" data-i="${i}">Delete</button></td></tr>`).join("")
    || `<tr><td colspan="8" class="text-gray-400 py-8 text-center">No addons here yet. Select Add addon to create one.</td></tr>`;
}
async function drawHist() {
  const el = $("#hist"); el.innerHTML = `<p class="text-gray-400">Loading history...</p>`; let h = "";
  for (const k of Object.keys(F)) {
    const r = await api(`commits?path=${F[k].path}&sha=${encodeURIComponent(gh.b)}&per_page=8`), l = r.ok ? await r.json() : [];
    h += `<h3 class="font-bold mt-4 mb-2">${F[k].path}</h3>` + (l.map(c => `<div class="panel p-3 flex items-center justify-between gap-3 mb-2 text-sm"><div><div>${esc(c.commit.message.split("\n")[0])}</div>
      <div class="text-xs text-gray-500">${esc(c.commit.author.date.slice(0, 16).replace("T", " "))} by ${esc(c.commit.author.name)}</div></div>
      <button class="ghost" data-act="restore" data-k="${k}" data-ref="${c.sha}">Restore</button></div>`).join("") || `<p class="text-sm text-gray-400">No commits yet for this file.</p>`);
  }
  el.innerHTML = h;
}

/* ---------- addon form ---------- */
function openForm(i) {
  formKind = "addon"; editing = i; $("#ferr").textContent = "";
  const a = i >= 0 ? { ...F.addons.data[i] } : { category: "addon", edition: "bedrock", downloads: 0, rating: 4.5, verified: false };
  a.tags = (a.tags || []).join(", "); a.changelog = (a.changelog || []).join("\n");
  $("#fbody").innerHTML = AF.map(f => field(f, a[f[0]])).join(""); $("#ftitle").textContent = i >= 0 ? "Edit addon" : "Add addon"; document.querySelectorAll(".mded").forEach(mdPrev);
  $("#form").classList.remove("hidden");
}
function saveForm() {
  const o = readForm($("#fbody"), AF), bad = m => { $("#ferr").textContent = m; };
  o.id = (o.id || o.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!o.title || !o.id) return bad("Enter a title.");
  if (!isUrl(o.download)) return bad("The download URL must start with http:// or https://");
  if (o.thumb && !isUrl(o.thumb)) return bad("The thumbnail URL must start with http:// or https://");
  if (F.addons.data.some((a, i) => a.id === o.id && i !== editing)) return bad("Another addon already uses this ID.");
  o.rating = Math.max(0, Math.min(5, +o.rating || 0)); o.downloads = +o.downloads || 0;
  o.tags = o.tags.split(",").map(s => s.trim()).filter(Boolean).slice(0, 3);
  o.changelog = o.changelog.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 5);
  o.updated = new Date().toISOString().slice(0, 10);
  const n = { ...(editing >= 0 ? F.addons.data[editing] : {}), ...o };
  editing >= 0 ? F.addons.data[editing] = n : F.addons.data.push(n);
  $("#form").classList.add("hidden"); draw();
}

/* ---------- dashboard home ---------- */
function drawDash() {
  const r = [...F.addons.data].sort((a, b) => (b.updated || "") > (a.updated || "") ? 1 : -1).slice(0, 6), c = F.config.data, p = F.pages.data;
  $("#recent").innerHTML = r.map(a => `<li class="flex justify-between py-2 border-t border-white/10"><span>${esc(a.title)}</span><span class="text-gray-500 text-xs">${esc(a.updated || "")}</span></li>`).join("") || `<li class="text-gray-400 py-2">Nothing yet.</li>`;
  const todo = [[p.some(x => /privacy/i.test(x.slug + x.title)), "Publish a Privacy Policy page (ad networks require one)"], [p.some(x => /takedown|dmca/i.test(x.slug + x.title)), "Publish a takedown page for authors"],
    [!!c.adsenseClient, "Add your AdSense client ID in Settings"], [!!c.liveAds, "Turn on live ads in Settings"], [F.addons.data.length >= 10, "List at least 10 real addons"]];
  $("#todo").innerHTML = todo.map(([ok, t]) => `<li class="py-1.5">${ok ? "✓" : "○"} <span class="${ok ? "text-gray-500 line-through" : ""}">${t}</span></li>`).join("");
}

/* ---------- pages (Markdown, shown in the store at #/page/<slug>) ---------- */
let formKind = "addon";
function drawPages() {
  $("#prows").innerHTML = F.pages.data.map((p, i) => `<tr><td class="font-semibold">${esc(p.title)}</td><td class="text-gray-400">#/page/${esc(p.slug)}</td><td>${p.footer === false ? "No" : "Yes"}</td><td>${esc(p.updated || "")}</td>
    <td class="whitespace-nowrap"><button class="ghost" data-act="pedit" data-i="${i}">Edit</button> <button class="ghost" data-act="pdel" data-i="${i}">Delete</button></td></tr>`).join("")
    || `<tr><td colspan="5" class="text-gray-400 py-8 text-center">No pages yet. Start with a Privacy Policy and a takedown page.</td></tr>`;
}
function openPage(i) {
  formKind = "page"; editing = i; $("#ferr").textContent = "";
  const p = i >= 0 ? F.pages.data[i] : { footer: true, content: "# New page\n\nWrite here." };
  $("#fbody").innerHTML = PF.map(f => field(f, p[f[0]])).join(""); $("#ftitle").textContent = i >= 0 ? "Edit page" : "Add page";
  $("#form").classList.remove("hidden"); document.querySelectorAll(".mded").forEach(mdPrev);
}
function savePage() {
  const o = readForm($("#fbody"), PF), bad = m => { $("#ferr").textContent = m; };
  o.slug = (o.slug || o.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!o.title || !o.slug) return bad("Enter a title.");
  if (F.pages.data.some((p, i) => p.slug === o.slug && i !== editing)) return bad("Another page already uses this slug.");
  o.updated = new Date().toISOString().slice(0, 10); editing >= 0 ? F.pages.data[editing] = o : F.pages.data.push(o);
  $("#form").classList.add("hidden"); draw();
}

/* ---------- visual Markdown editor: toolbar + live preview (marked.js) ---------- */
function mdPrev(w) { w.querySelector(".mdprev").innerHTML = md(w.querySelector("textarea").value); }
document.addEventListener("input", e => { if (e.target.classList.contains("mdta")) mdPrev(e.target.closest(".mded")); });
document.addEventListener("click", e => {
  const b = e.target.closest("[data-md]"); if (!b) return;
  const w = b.closest(".mded"), ta = w.querySelector("textarea");
  if (b.dataset.md === "view") { w.classList.toggle("only"); return; }
  const m = MDB.find(x => x[0] === b.dataset.md), s = ta.selectionStart, en = ta.selectionEnd;
  ta.setRangeText(m[2] + (ta.value.slice(s, en) || "text") + m[3], s, en, "select"); ta.focus(); mdPrev(w);
});

/* ---------- publish: one commit per changed file ---------- */
async function publish() {
  const msg = $("#msg").value.trim() || "Update store data from BlockVault Admin"; $("#pub").disabled = true;
  try {
    for (const k of Object.keys(F)) {
      if (!dirty(k)) continue;
      const f = F[k], txt = ser(k);
      const r = await api("contents/" + f.path, { method: "PUT", body: JSON.stringify({ message: msg, content: b64e(txt + "\n"), branch: gh.b, ...(f.sha ? { sha: f.sha } : {}) }) });
      if (r.status === 409 || r.status === 422) throw new Error(f.path + " changed on GitHub after you opened it. Reload this page and repeat your edit.");
      if (!r.ok) throw new Error("GitHub error " + r.status);
      f.sha = (await r.json()).content.sha; f.orig = txt;
    }
    toast("Published. The live store picks it up within about 5 minutes.");
  } catch (e) { toast(e.message, true); }
  draw();
}
function applyRaw(k) {
  try {
    const d = JSON.parse($("#raw_" + k).value);
    if (LIST[k]) { const l = Array.isArray(d) ? d : d[k]; if (!Array.isArray(l)) throw 0; F[k].data = l; }
    else if (d && typeof d === "object" && !Array.isArray(d)) F.config.data = d; else throw 0;
    toast("Applied. Press Publish to make it live."); draw();
  } catch (e) { toast("That is not valid JSON for this file.", true); }
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-act],[data-tab]"); if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; draw(); return; }
  const i = +t.dataset.i, a = F.addons.data[i];
  if (t.dataset.act === "edit") openForm(i);
  if (t.dataset.act === "del" && confirm(`Delete "${a.title}"? You can bring it back from History.`)) { F.addons.data.splice(i, 1); draw(); }
  if (t.dataset.act === "raw") applyRaw(t.dataset.k);
  if (t.dataset.act === "pedit") openPage(i);
  if (t.dataset.act === "pdel" && confirm(`Delete the page "${F.pages.data[i].title}"?`)) { F.pages.data.splice(i, 1); draw(); }
  if (t.dataset.act === "restore") { try { F[t.dataset.k].data = await loadFile(t.dataset.k, t.dataset.ref); draw(); toast("Loaded into the editor. Press Publish to make it live."); } catch (x) { toast(x.message, true); } }
});
document.addEventListener("change", e => { const t = e.target, k = t.dataset.act; if (k === "verified" || k === "featured") { F.addons.data[+t.dataset.i][k] = t.checked; draw(); } });
$("#cfg").addEventListener("input", () => { F.config.data = Object.fromEntries(Object.entries(readForm($("#cfg"), CF)).filter(([, v]) => v !== "")); status(); });
$("#q").addEventListener("input", e => { q = e.target.value.trim().toLowerCase(); drawTable(); });
$("#add").addEventListener("click", () => openForm(-1));
$("#fs").addEventListener("click", () => formKind === "page" ? savePage() : saveForm());
$("#addp").addEventListener("click", () => openPage(-1));
["fx", "fc"].forEach(id => $("#" + id).addEventListener("click", () => $("#form").classList.add("hidden")));
$("#pub").addEventListener("click", publish);
$("#out").addEventListener("click", () => { localStorage.removeItem("bv_gh"); sessionStorage.removeItem("bv_gh"); location.reload(); });
$("#exp").addEventListener("click", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ser("addons")], { type: "application/json" })); a.download = "addons.json"; a.click(); });
$("#imp").addEventListener("change", async e => {
  try {
    const d = JSON.parse(await e.target.files[0].text()), l = Array.isArray(d) ? d : d.addons;
    l.forEach(n => { if (!n || !n.id || !n.title) return; const i = F.addons.data.findIndex(a => a.id === n.id); i >= 0 ? F.addons.data[i] = n : F.addons.data.push(n); });
    draw(); toast(`Imported ${l.length} entries. Press Publish to make them live.`);
  } catch (x) { toast("Could not read that file.", true); }
  e.target.value = "";
});
$("#go").addEventListener("click", () => {
  const g = { o: $("#o").value.trim(), r: $("#r").value.trim(), b: $("#b").value.trim() || "main", t: $("#t").value.trim() };
  if (!g.o || !g.r || !g.t) { $("#lerr").textContent = "Fill in the username, repository and token."; return; }
  connect(g, $("#rem").checked);
});
addEventListener("beforeunload", e => { if (gh && Object.keys(F).some(dirty)) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- auto-connect if a token was saved ---------- */
(() => {
  try { const s = localStorage.getItem("bv_gh") || sessionStorage.getItem("bv_gh"); if (s) { const g = JSON.parse(s); $("#o").value = g.o; $("#r").value = g.r; $("#b").value = g.b; connect(g, !!localStorage.getItem("bv_gh")); } } catch (e) {}
})();
