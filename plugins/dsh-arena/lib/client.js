"use strict";
(() => {
  // src/client.ts
  if (typeof window !== "undefined" && window.__ModuleLoader__) {
    ;
    window.__ModuleLoader__.load({
      id: "arena",
      factory: () => ({
        inject: ["betterSidebar"],
        apply(ctx) {
          const el = document.createElement("div");
          el.style.cssText = "padding:14px;font-family:inherit;color:inherit";
          el.innerHTML = `
          <h2 style="font-size:15px;margin:0 0 10px">\u6BD4\u6B66\u53F0</h2>
          <div id="arena-run" style="font-size:12px;opacity:.75;margin-bottom:10px">\u52A0\u8F7D\u4E2D\u2026</div>
          <div id="arena-table"></div>
        `;
          let mounted = false;
          const render = async () => {
            const box = el.querySelector("#arena-run");
            try {
              const res = await fetch("/api/arena/verdict", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ payload: { args: { p: { repo: "" } } } })
              });
              const data = await res.json();
              const rows = data?.value?.rows ?? [];
              box.textContent = rows.length ? `\u672C\u573A ${rows.length} \u540D\u961F\u5458` : "\u5F53\u524D\u65E0\u6BD4\u8D5B";
              const table = el.querySelector("#arena-table");
              table.innerHTML = rows.map(
                (r) => `<div style="display:flex;gap:8px;padding:6px 8px;border:1px solid rgba(128,128,128,.25);border-radius:8px;margin-bottom:6px;font-size:12px">
                     <b>${r.member}</b><span>files ${r.filesCount}</span>
                     <span style="margin-left:auto;color:${r.mergeClean ? "#43c78b" : "#e2ab3f"}">${r.mergeClean ? "\u53EF\u5408\u5E76" : "\u51B2\u7A81"}</span>
                   </div>`
              ).join("");
            } catch (e) {
              box.textContent = `\u52A0\u8F7D\u5931\u8D25\uFF1A${String(e)}`;
            }
          };
          return {
            apply() {
              if (mounted) return;
              mounted = true;
              void render();
            }
          };
        }
      })
    });
  }
})();
