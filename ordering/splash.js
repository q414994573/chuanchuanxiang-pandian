/* Opening only; never reads or writes login, storage or order data. */
(() => {
  'use strict';
  const welcome = document.getElementById('ccx-welcome');
  if (!welcome) return;
  const art = welcome.querySelector('img');
  let finished = false, contact = false, eatClick = false;
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const dismiss = () => {
    if (finished) return;
    finished = true;
    welcome.remove();
  };
  const active = () => !finished && getComputedStyle(welcome).visibility !== 'hidden' && getComputedStyle(welcome).display !== 'none';
  // Capture the complete gesture, including a click synthesized after touch-up.
  // Keep this guard after removal so that auto-expiry during a press is safe too.
  document.addEventListener('pointerdown', event => {
    if (active()) { contact = true; stop(event); }
    else { eatClick = false; }
  }, true);
  document.addEventListener('pointerup', event => {
    if (!contact) return;
    contact = false; eatClick = true; stop(event); dismiss();
  }, true);
  document.addEventListener('pointercancel', () => { contact = false; }, true);
  document.addEventListener('click', event => {
    if (active() || contact || eatClick) {
      contact = false; eatClick = false; stop(event); dismiss();
    }
  }, true);
  welcome.addEventListener('keydown', event => {
    if (['Enter', ' ', 'Escape'].includes(event.key)) { stop(event); dismiss(); }
  });
  const loaded = () => { if (!finished) welcome.classList.add('art-ready'); };
  art.addEventListener('load', loaded, {once:true});
  art.addEventListener('error', dismiss, {once:true});
  if (art.complete) { if (art.naturalWidth) loaded(); else dismiss(); }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) dismiss();
  // CSS fades out at 2.4s and hides at 3s even if this script is unavailable.
  welcome.addEventListener('animationend', dismiss, {once:true});
  setTimeout(dismiss, 3050);
  document.addEventListener('visibilitychange', () => { if (document.hidden) dismiss(); });
  window.addEventListener('pageshow', event => { if (event.persisted) dismiss(); });
})();
