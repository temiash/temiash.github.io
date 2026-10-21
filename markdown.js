/* Shared Markdown renderer for store and dashboard: marked.js converts, DOMPurify removes anything unsafe */
(function () {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (window.DOMPurify) DOMPurify.addHook("afterSanitizeAttributes", n => { if (n.tagName === "A") { n.setAttribute("target", "_blank"); n.setAttribute("rel", "noopener nofollow ugc"); } });
  window.md = t => { try { return DOMPurify.sanitize(marked.parse(String(t || ""), { gfm: true, breaks: true })); } catch (e) { return "<p>" + esc(t) + "</p>"; } };
})();
