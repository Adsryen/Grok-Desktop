/**
 * 启动前上色（CSP 下用外链脚本，禁止 inline）。
 * 优先读 localStorage 缓存的偏好；system 时跟 OS。
 * 正式 settings.theme 由 renderer boot 后再覆盖。
 */
(function () {
  try {
    var pref = localStorage.getItem("grok-desktop-theme") || "system";
    var dark =
      pref === "dark" ||
      (pref !== "light" &&
        typeof matchMedia === "function" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    var t = dark ? "dark" : "light";
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  } catch (e) {
    /* ignore */
  }
})();
