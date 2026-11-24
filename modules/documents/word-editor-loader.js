/* Charge l'éditeur Word uniquement lorsqu'un utilisateur le sollicite.
 * Les trois API publiques sont disponibles dès le démarrage pour compatibilité.
 * Les droits restent évalués par le module original côté serveur.
 */
(function () {
  'use strict';
  var promise = null;
  var url = './modules/documents/word-editor.js?v=20261121-modularisation-2';
  function load() {
    if (promise) return promise;
    promise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.onload = function () {
        if (window.dvWordEdit === wordEdit || window.dvPerm === permission ||
            window.dvTogglePerm === togglePermission) {
          reject(new Error('Initialisation de l\'éditeur incomplète'));
          return;
        }
        resolve();
      };
      script.onerror = function () { reject(new Error('Éditeur Word indisponible')); };
      document.head.appendChild(script);
    }).catch(function (error) {
      promise = null;
      throw error;
    });
    return promise;
  }
  function notify(error) {
    if (window.toast) window.toast(error.message || String(error));
    else console.error('[AfriFlow documents]', error);
  }
  function wordEdit(path, original) {
    load().then(function () { window.dvWordEdit(path, original); }).catch(notify);
  }
  function permission(path) {
    return load().then(function () { return window.dvPerm(path); }).catch(function (error) {
      notify(error);
      return false; // jamais autoriser l'édition si l'accès ne peut être vérifié
    });
  }
  function togglePermission(path) {
    return load().then(function () { return window.dvTogglePerm(path); }).catch(function (error) {
      notify(error);
      return false;
    });
  }
  window.dvWordEdit = wordEdit;
  window.dvPerm = permission;
  window.dvTogglePerm = togglePermission;
})();
