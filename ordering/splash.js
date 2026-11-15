/* One decorative opening per document. No storage, auth or order mutations. */
(() => {
  'use strict';
  const welcome = document.getElementById('ccx-welcome');
  if (!welcome) return;
  const art = welcome.querySelector('img');
  const app = document.getElementById('app');
  const start = performance.now();
  let finished = false, observer, readyTimer;
  const dismiss = () => {
    if (finished) return;
    finished = true;
    clearTimeout(readyTimer);
    observer?.disconnect();
    welcome.classList.add('leaving');
    setTimeout(() => welcome.remove(), 200);
  };
  const loaded = () => { if (!finished) welcome.classList.add('art-ready'); };
  art.addEventListener('load', loaded, {once:true});
  art.addEventListener('error', dismiss, {once:true});
  if (art.complete) { if (art.naturalWidth) loaded(); else dismiss(); }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) dismiss();
  if (!finished && app) {
    observer = new MutationObserver(() => {
      observer.disconnect();
      readyTimer = setTimeout(dismiss, Math.max(0, 700 - (performance.now() - start)));
    });
    observer.observe(app, {childList:true, subtree:true});
  }
  // Never hold the page for network, image, application or login completion.
  setTimeout(dismiss, 1050);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) dismiss();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) dismiss(); });
})();
