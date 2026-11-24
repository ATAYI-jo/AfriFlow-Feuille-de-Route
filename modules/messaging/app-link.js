/* Keep email HTTPS links usable even when the OS cannot capture them. */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  var id = params.get("message");
  if (!id || !/^[0-9]{10,17}:[a-z0-9]{1,16}$/.test(id) || params.get("web") === "1") return;
  function offer() {
    if (window.AfriFlowNative || window.AfriFlowAndroid ||
        window.navigator.standalone || matchMedia("(display-mode: standalone)").matches ||
        matchMedia("(display-mode: minimal-ui)").matches) return;
    var ua = navigator.userAgent || "";
    var android = /Android/i.test(ua), windows = /Windows/i.test(ua);
    if (!android && !windows) return;
    var web = new URL(location.href);
    web.searchParams.set("web", "1");
    var nativeUrl = "afriflow://message?message=" + encodeURIComponent(id);
    if (android) nativeUrl = "intent://message?message=" + encodeURIComponent(id) +
      "#Intent;scheme=afriflow;package=africa.afriflow.app;S.browser_fallback_url=" +
      encodeURIComponent(web.href) + ";end";
    var box = document.createElement("aside");
    box.setAttribute("aria-label", "Ouverture du message AfriFlow");
    box.style.cssText = "position:fixed;top:calc(env(safe-area-inset-top, 0px) + 10px);left:50%;transform:translateX(-50%);width:min(440px,calc(100% - 24px));box-sizing:border-box;z-index:2147483000;background:#fff;color:#193c2b;border:1px solid #b9d1c2;border-radius:16px;padding:16px;box-shadow:0 8px 32px #0003;font:15px/1.45 system-ui,sans-serif";
    var title = document.createElement("strong");
    title.textContent = "Lire dans AfriFlow";
    var desc = document.createElement("p");
    desc.textContent = "Ouvrez le message dans votre application installée, ou continuez ici.";
    desc.style.margin = "6px 0 12px";
    var link = document.createElement("a");
    link.href = nativeUrl;
    link.textContent = "Ouvrir dans l’application";
    link.style.cssText = "display:block;background:#285d40;color:#fff;text-align:center;padding:12px;border-radius:9px;font-weight:650;text-decoration:none";
    var fallback = document.createElement("button");
    fallback.type = "button";
    fallback.textContent = "Continuer sur le site web";
    fallback.style.cssText = "display:block;width:100%;margin-top:8px;padding:10px;background:transparent;color:#285d40;border:0;text-decoration:underline;cursor:pointer;font:inherit";
    fallback.addEventListener("click",function(){box.remove();});
    document.addEventListener("visibilitychange",function(){if(document.hidden)box.remove();});
    box.append(title,desc,link,fallback);
    document.body.appendChild(box);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",offer,{once:true});else offer();
})();
