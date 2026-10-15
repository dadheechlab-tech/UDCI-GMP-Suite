'use strict';
/* Boot: register the service worker where supported, then render. */
(function () {
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  function start() {
    App.api('auth.status').then(function (st) {
      if (st && st.signedIn && st.user) App.state.user = st.user;
      App.render();
    }).catch(function () { App.render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
