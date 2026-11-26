/* Shared, evidence-aware attendance. A website check-in is never Teams presence. */
(function () {
  "use strict";
  var cache = null, pendingLoad = null, dataRevision = 0, dialog = null, knownMeetings = {}, knownRecords = {};
  var EVENT_TABLE = "afriflow_attendance_events";
  var OUTCOMES = {
    on_time: { k: "ok", t: "Présence à l’heure confirmée" },
    late: { k: "late", t: "Retard confirmé" },
    excused: { k: "ok", t: "Absence excusée" },
    absent: { k: "abs", t: "Absence confirmée" }
  };
  function me() { return String(window.loggedUserEmail || "").trim().toLowerCase(); }
  function sb() { return window.__sb; }
  function table() { return window.__TABLE || "afriflow_state"; }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function emailKey(id, email) { return id + ":" + String(email || "").trim().toLowerCase(); }
  function canReview() { return window.USER_ROLE === "admin" || !!(window.AfriCensorAccess && window.AfriCensorAccess() === true); }
  function scope() { return me() + "|" + (canReview() ? "review" : "own"); }
  function number(value, fallback) { return value !== null && value !== "" && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : fallback; }
  function stamp(value) { var n = typeof value === "number" ? value : Date.parse(value); return Number.isFinite(n) ? n : 0; }
  function eventOrder(a, b) { return stamp(a.created_at) - stamp(b.created_at) || String(a.id || "").localeCompare(String(b.id || "")); }
  function eventState(events) {
    var list = (events || []).slice().sort(eventOrder), requests = list.filter(function (e) { return e.kind === "request"; });
    var decisions = list.filter(function (e) { return e.kind === "decision"; });
    var pending = requests.filter(function (request) { return !decisions.some(function (decision) { return decision.request_id === request.id; }); });
    var confirmed = decisions.filter(function (decision) { return !!OUTCOMES[decision.outcome]; });
    return { list: list, pending: pending[pending.length - 1] || null, latest: decisions[decisions.length - 1] || null, confirmed: confirmed[confirmed.length - 1] || null };
  }

  function status(meeting, record, options) {
    meeting = meeting || {}; options = options || {};
    var rawAt = record ? number(record.at, null) : null;
    var start = number(record && record.scheduledStart, number(meeting.start, null));
    var grace = Math.max(0, Math.min(120, number(record && record.graceMinutes, number(meeting.grace, 5))));
    var duration = Math.max(0, number(meeting.dur, 60)), now = number(options.now, Date.now());
    var state = eventState(options.events);
    var base = { rawAt: rawAt, scheduledStart: start, graceMinutes: grace,
      offsetMinutes: rawAt !== null && start !== null ? (rawAt - start) / 60000 : null,
      pending: state.pending, review: state.confirmed, latestDecision: state.latest, source: "checkin" };
    function result(k, t, extra) { return Object.assign({}, base, { k: k, t: t }, extra || {}); }
    if (options.unavailable) return result("wait", "Présence indisponible", { unavailable: true, source: "unavailable", review: null, pending: null });
    // Exemptions never lose their effect because an original website click was late.
    if (options.permission) return result("ok", "Excusé — permission accordée", { source: "permission" });
    var request = options.justification, decision = options.decision;
    if (request && decision && decision.ok === true && number(decision.at, 0) >= number(request.at, Infinity))
      return result("ok", "Excusé — justificatif accepté", { source: "justification" });
    if (state.confirmed) return result(OUTCOMES[state.confirmed.outcome].k, OUTCOMES[state.confirmed.outcome].t,
      { source: "review", confirmedAt: stamp(state.confirmed.occurred_at) || null });
    if (state.pending) return result("wait", "Vérification en cours", { source: "request" });
    if (state.latest && state.latest.outcome === "rejected") return result("wait", "Présence à confirmer — demande refusée", { source: "request" });
    if (start === null) return result("wait", "Horaire à vérifier");
    if (rawAt !== null) return rawAt <= start + grace * 60000
      ? result("ok", "Pointage à l’heure") : result("late", "Pointage à vérifier");
    if (record) return result("wait", "Pointage à vérifier");
    return result("wait", now > start + duration * 60000 ? "Présence à confirmer" : now < start ? "À venir" : "Pointage non reçu");
  }

  // Paginate every collection: an omitted older row must not become an absence.
  async function allRows(makeQuery) {
    var rows = [], offset = 0, pageSize = 500;
    while (true) {
      var response = await makeQuery().range(offset, offset + pageSize - 1);
      if (!response || response.error || !Array.isArray(response.data)) throw response && response.error || new Error("Lecture des présences impossible.");
      rows = rows.concat(response.data);
      if (response.data.length < pageSize) return rows;
      offset += pageSize;
    }
  }
  async function load() {
    if (!me() || !sb()) throw new Error("Connectez-vous pour consulter les présences.");
    var owner = scope(), account = me(), revision = dataRevision;
    if (pendingLoad && pendingLoad.owner === owner) return pendingLoad.promise;
    var token = {};
    token.owner = owner;
    token.promise = (async function () {
      var tail = canReview() ? "%" : "%:" + account;
      var responses = await Promise.all([
        allRows(function () { return sb().from(table()).select("key,value").like("key", "att:j-" + tail).order("key"); }),
        allRows(function () { return sb().from(table()).select("key,value").like("key", "att:jd-" + tail).order("key"); }),
        allRows(function () { return sb().from(table()).select("key,value").like("key", "att:perm-" + tail).order("key"); }),
        allRows(function () { return sb().from(EVENT_TABLE).select("id,meeting_id,member_email,kind,request_id,outcome,occurred_at,reason,actor_email,actor_id,created_at").order("created_at").order("id"); })
      ]);
      // Learning that the member is a censeur while their own view loads is safe.
      // Losing review access or changing accounts must discard the old response.
      if (me() !== account || owner.endsWith("|review") && !canReview()) throw new Error("La session a changé. Actualisez les présences.");
      if (revision !== dataRevision) throw new Error("Les présences ont changé. Actualisez pour lire la dernière décision.");
      var data = { account: account, scope: owner, justifications: {}, decisions: {}, permissions: {}, events: {}, unavailable: false };
      ["justifications", "decisions", "permissions"].forEach(function (name, i) {
        responses[i].forEach(function (row) { var v = row.value; if (v && v.mid && v.email) data[name][emailKey(v.mid, v.email)] = v; });
      });
      responses[3].forEach(function (event) {
        if (!event.meeting_id || !event.member_email) return;
        var key = emailKey(event.meeting_id, event.member_email);
        (data.events[key] || (data.events[key] = [])).push(event);
      });
      if (scope() === owner) cache = data;
      return data;
    })();
    pendingLoad = token;
    try { return await token.promise; } finally { if (pendingLoad === token) pendingLoad = null; }
  }
  async function loadPersonal() {
    var account = me();
    if (!account || !sb()) throw new Error("Connectez-vous pour consulter les présences.");
    var rows = await Promise.all([
      allRows(function () { return sb().from(table()).select("value").like("key", "meet:%").order("key"); }),
      allRows(function () { return sb().from(table()).select("value").like("key", "att:m%:" + account).order("key"); }),
      load()
    ]);
    if (account !== me()) throw new Error("La session a changé. Actualisez les présences.");
    return { meetings: rows[0], records: rows[1], attendance: rows[2] };
  }
  function context(data, meetingId, email) {
    if (!data || data.unavailable || data.account && data.account !== me()) return { unavailable: true, events: [] };
    var key = emailKey(meetingId, email);
    return { justification: (data.justifications || {})[key], decision: (data.decisions || {})[key],
      permission: (data.permissions || {})[key], events: (data.events || {})[key] || [], unavailable: false };
  }
  function dateLabel(value) {
    var valueAt = typeof value === "number" ? value : stamp(value);
    if (!Number.isFinite(valueAt) || !valueAt) return "Non renseignée";
    return new Date(valueAt).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
  }
  function zone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "celui de votre appareil"; } catch (_) { return "celui de votre appareil"; } }
  function offsetLabel(minutes) {
    if (minutes === null) return "";
    var total = Math.abs(Math.round(minutes * 60)), min = Math.floor(total / 60), sec = total % 60;
    return (min ? min + " min" + (sec ? " " : "") : "") + (sec || !min ? sec + " s" : "") + (minutes < 0 ? " avant" : " après") + " l’horaire prévu";
  }
  function evidenceHTML(record, value) {
    if (!record || value.rawAt === null) return '<p class="af-att-evidence">Aucun pointage AfriFlow reçu. Cela ne prouve pas une absence dans Teams.</p>';
    return '<p class="af-att-evidence"><b>Pointage AfriFlow :</b> ' + esc(dateLabel(value.rawAt))
      + (value.offsetMinutes !== null ? '<br>' + esc(offsetLabel(value.offsetMinutes)) + ' · tolérance : ' + value.graceMinutes + ' min' : '')
      + '<br>Heure de réception conservée ; la participation à Teams se vérifie séparément.</p>';
  }
  function historyHTML(events) {
    var state = eventState(events);
    if (!state.list.length) return "";
    return '<details class="af-att-history"><summary>Historique des vérifications (' + state.list.length + ')</summary>'
      + state.list.map(function (event) {
        var title = event.kind === "request" ? "Demande du membre" : event.outcome === "rejected" ? "Demande refusée" : (OUTCOMES[event.outcome] || { t: "Décision" }).t;
        return '<article><b>' + esc(title) + '</b><small>' + esc(event.actor_email || event.member_email || "") + ' · ' + esc(dateLabel(event.created_at)) + '</small>'
          + '<p>' + esc(event.reason) + '</p>' + (event.occurred_at ? '<small>' + (event.kind === "request" ? 'Arrivée déclarée (à vérifier)' : 'Heure confirmée par le responsable') + ' : ' + esc(dateLabel(event.occurred_at)) + '</small>' : '') + '</article>';
      }).join("") + '</details>';
  }
  function justificationHTML(options, meetingId) {
    var jf = options.justification, jd = options.decision, perm = options.permission;
    var decided = jf && jd && Number(jd.at) >= Number(jf.at);
    var out = perm ? '<b>Permission accordée</b><p>' + esc(perm.reason) + '</p><small>' + esc(perm.by) + ' · ' + esc(dateLabel(perm.at)) + '</small>'
      : !jf ? 'Aucun justificatif envoyé.' : decided ? '<b>' + (jd.ok ? 'Justificatif accepté' : 'Justificatif refusé') + '</b>'
        + (!jd.ok ? '<p>' + esc(jd.reason) + '</p><button type="button" data-jp-resend="' + esc(meetingId) + '">Corriger et renvoyer</button>' : '') : 'Justificatif en attente du censeur.';
    if (jd && Array.isArray(jd.history) && jd.history.length) out += '<details><summary>Historique des décisions</summary>' + jd.history.map(function (d) { return '<p>' + esc(d.ok ? 'Accepté' : 'Refusé') + ' · ' + esc(dateLabel(d.at)) + (d.reason ? ' — ' + esc(d.reason) : '') + '</p>'; }).join("") + '</details>';
    return out;
  }
  function renderPersonal(root, meetings, records, data) {
    var account = me(); if (!root || !account) return;
    if (!data || data.unavailable || data.account !== account) { root.innerHTML = '<p role="alert">Présences indisponibles. Aucun statut d’absence n’est déduit de cette erreur. Utilisez Actualiser pour réessayer.</p>'; return; }
    cache = data;
    root.innerHTML = '<div class="af-att-personal"><p class="af-att-note">Un pointage AfriFlow enregistre la réception de votre clic. Il ne prouve ni votre heure d’entrée ni votre durée de présence dans Teams. Demandez une vérification si le pointage ne reflète pas votre participation.</p>'
      + '<p class="af-att-zone">Fuseau d’affichage : <b>' + esc(zone()) + '</b>. Les heures de référence et l’historique sont conservés.</p><div class="af-att-table"><table class="t"><thead><tr><th>Réunion</th><th>Pointage et présence</th><th>Vérification</th><th>Justificatifs</th></tr></thead><tbody>'
      + meetings.map(function (meeting) {
        var key = emailKey(meeting.id, account), record = records[meeting.id] || records["att:" + key] || null;
        knownMeetings[meeting.id] = meeting; knownRecords[key] = record;
        var options = context(data, meeting.id, account), value = status(meeting, record, options);
        return '<tr><td><b>' + esc(meeting.title) + '</b><small>' + esc(dateLabel(Number(meeting.start))) + '</small></td>'
          + '<td><span class="mt-pill mt-' + value.k + '">' + esc(value.t) + '</span>' + evidenceHTML(record, value) + '</td>'
          + '<td>' + (value.pending ? '<p>Demande reçue le ' + esc(dateLabel(value.pending.created_at)) + '. Un responsable doit l’examiner.</p>'
            : '<button type="button" data-att-request="' + esc(meeting.id) + '">Demander une vérification</button>') + historyHTML(options.events) + '</td>'
          + '<td>' + justificationHTML(options, meeting.id) + '</td></tr>';
      }).join("") + '</tbody></table></div></div>';
  }

  function announce(message) { if (window.toast) window.toast(message); }
  function closeDialog() { if (dialog) dialog.close(); }
  function modal(title, body) {
    closeDialog();
    var owner = me(), previous = document.activeElement, overlay = document.createElement("div");
    overlay.className = "af-att-overlay";
    overlay.innerHTML = '<section class="af-att-dialog" role="dialog" aria-modal="true" aria-labelledby="afAttTitle"><header><h2 id="afAttTitle" tabindex="-1">' + esc(title) + '</h2><button type="button" id="afAttClose">Fermer</button></header>' + body + '</section>';
    document.body.appendChild(overlay);
    var state = { node: overlay, owner: owner, busy: false, close: function () {
      document.removeEventListener("keydown", keys, true); overlay.remove();
      if (dialog === state) dialog = null;
      if (previous && previous.isConnected && previous.focus) previous.focus({ preventScroll: true });
    } };
    function keys(event) {
      // A meeting invitation may temporarily cover this dialog. Only the
      // visible modal should consume Escape or move keyboard focus.
      if (overlay.inert) return;
      if (event.key === "Escape") { event.preventDefault(); state.close(); return; }
      if (event.key !== "Tab") return;
      var controls = Array.from(overlay.querySelectorAll('button,input,textarea,select,[tabindex="0"]')).filter(function (n) { return !n.disabled && !n.hidden; });
      if (!controls.length) return;
      var first = controls[0], last = controls[controls.length - 1];
      if (!overlay.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }
    overlay.querySelector("#afAttClose").onclick = state.close;
    overlay.addEventListener("click", function (event) { if (event.target === overlay && !state.busy) state.close(); });
    document.addEventListener("keydown", keys, true); dialog = state;
    overlay.querySelector("#afAttTitle").focus({ preventScroll: true });
    return state;
  }
  function fields(kind) {
    return (kind === "decision" ? '<label for="afAttOutcome">Conclusion après vérification</label><select id="afAttOutcome" required><option value="">Choisir une conclusion</option><option value="on_time">Présence à l’heure confirmée</option><option value="late">Retard confirmé</option><option value="excused">Absence excusée</option><option value="absent">Absence confirmée</option><option value="rejected">Refuser la demande — éléments insuffisants</option></select>' : '')
      + '<label for="afAttTime">' + (kind === "decision" ? 'Heure d’arrivée confirmée' : 'Votre heure d’arrivée dans Teams') + ' (facultatif)</label><input type="datetime-local" id="afAttTime" step="1">'
      + '<p class="af-att-zone">Fuseau de saisie : <b>' + esc(zone()) + '</b>. ' + (kind === "decision" ? 'Laissez ce champ vide si l’heure exacte n’est pas établie.' : 'Cette heure est votre déclaration ; elle ne remplace pas le pointage serveur.') + '</p>'
      + '<label for="afAttReason">' + (kind === "decision" ? 'Motif et éléments vérifiés' : 'Explication et éléments permettant de vérifier votre présence') + '</label><textarea id="afAttReason" minlength="10" maxlength="2000" rows="5" required></textarea>'
      + '<p class="af-att-note">10 à 2 000 caractères. Précisez, par exemple, le lien utilisé, un problème de connexion ou les éléments du rapport Teams à vérifier.</p><p id="afAttError" role="alert"></p>'
      + '<div class="af-att-actions"><button type="button" id="afAttCancel">Annuler</button><button type="submit" class="p" id="afAttSubmit">' + (kind === "decision" ? 'Enregistrer la décision' : 'Envoyer la demande') + '</button></div>';
  }
  function readTime(input) { if (!input.value) return null; var at = new Date(input.value); if (!Number.isFinite(at.getTime())) throw new Error("Indiquez une date et une heure valides."); return at.toISOString(); }
  function bindSubmit(state, rpcName, makeArgs, meetingId, message) {
    var node = state.node, form = node.querySelector("form"), error = node.querySelector("#afAttError"), submit = node.querySelector("#afAttSubmit");
    node.querySelector("#afAttCancel").onclick = state.close;
    form.onsubmit = async function (event) {
      event.preventDefault(); if (state.busy) return;
      if (state.owner !== me() || !sb()) { error.textContent = "Votre session a changé. Fermez cette fenêtre puis reconnectez-vous."; return; }
      var reason = node.querySelector("#afAttReason").value.trim();
      if (reason.length < 10 || reason.length > 2000) { error.textContent = "Le motif doit comporter entre 10 et 2 000 caractères."; return; }
      try {
        var args = makeArgs(reason, readTime(node.querySelector("#afAttTime")));
        state.busy = true; submit.disabled = true; error.textContent = "";
        var response = await sb().rpc(rpcName, args);
        if (!response || response.error) throw response && response.error || new Error("Aucune réponse du serveur.");
        var row = Array.isArray(response.data) ? response.data[0] : response.data;
        if (!row || !row.id) throw new Error("L’enregistrement n’a pas été confirmé. Actualisez avant de réessayer.");
        cache = null; dataRevision++; pendingLoad = null;
        if (state.owner !== me()) { state.close(); return; }
        state.close(); announce(message);
        window.dispatchEvent(new CustomEvent("afriflow:attendance-changed", { detail: { meetingId: meetingId } }));
      } catch (failure) { if (node.isConnected) error.textContent = "Enregistrement impossible : " + (failure.message || failure); }
      finally { state.busy = false; if (node.isConnected) submit.disabled = false; }
    };
  }
  function request(meetingId) {
    if (!/^m[a-z0-9]{5,35}$/.test(String(meetingId)) || !me()) { announce("Ouvrez une réunion de vos présences après connexion."); return false; }
    var options = context(cache, meetingId, me()), waiting = eventState(options.events).pending;
    if (waiting) { announce("Une demande est déjà en cours pour cette réunion."); return false; }
    var meeting = knownMeetings[meetingId] || { id: meetingId }, record = knownRecords[emailKey(meetingId, me())];
    var state = modal("Demander une vérification", '<p><b>' + esc(meeting.title || "Réunion") + '</b></p>' + evidenceHTML(record, status(meeting, record))
      + '<p>Le censeur examinera votre participation. Le pointage original et chaque décision resteront dans l’historique.</p><form>' + fields("request") + '</form>');
    bindSubmit(state, "af_meeting_attendance_request", function (reason, at) { return { p_meeting_id: meetingId, p_reason: reason, p_claimed_at: at }; }, meetingId, "Demande de vérification envoyée au censeur.");
    return true;
  }
  function review(requestId) {
    if (!canReview() || !cache || cache.account !== me()) { announce("Actualisez les présences pour consulter les demandes autorisées."); return false; }
    var requestEvent = null, events = [];
    Object.keys(cache.events).some(function (key) {
      var found = cache.events[key].find(function (event) { return event.kind === "request" && event.id === requestId; });
      if (!found) return false; requestEvent = found; events = cache.events[key]; return true;
    });
    if (!requestEvent) { announce("Cette demande n’est plus disponible. Actualisez les présences."); return false; }
    if (String(requestEvent.member_email).toLowerCase() === me()) { announce("Votre demande doit être examinée par un autre responsable."); return false; }
    if (events.some(function (event) { return event.kind === "decision" && event.request_id === requestId; })) { announce("Cette demande a déjà reçu une décision. Actualisez les présences."); return false; }
    var meeting = knownMeetings[requestEvent.meeting_id] || {}, record = knownRecords[emailKey(requestEvent.meeting_id, requestEvent.member_email)];
    var state = modal("Examiner une présence", '<p><b>' + esc(meeting.title || "Réunion") + '</b><br>' + esc(requestEvent.member_email) + '</p>'
      + evidenceHTML(record, status(meeting, record)) + '<section class="af-att-claim"><b>Déclaration du membre</b><p>' + esc(requestEvent.reason) + '</p><small>Arrivée déclarée : ' + esc(dateLabel(requestEvent.occurred_at)) + ' — à vérifier</small></section>'
      + '<p>Vérifiez le rapport Teams ou les éléments disponibles. Une décision n’efface jamais le pointage original.</p><form>' + fields("decision") + '</form>');
    var conclusion = state.node.querySelector("#afAttOutcome"), confirmedTime = state.node.querySelector("#afAttTime");
    conclusion.onchange = function () {
      confirmedTime.disabled = conclusion.value !== "on_time" && conclusion.value !== "late";
      if (confirmedTime.disabled) confirmedTime.value = "";
    };
    conclusion.onchange();
    bindSubmit(state, "af_meeting_attendance_decide", function (reason, at) {
      var outcome = state.node.querySelector("#afAttOutcome").value;
      if (!OUTCOMES[outcome] && outcome !== "rejected") throw new Error("Choisissez une conclusion après vérification.");
      if (!canReview()) throw new Error("Votre autorisation de contrôle a changé.");
      return { p_request_id: requestId, p_outcome: outcome, p_reason: reason, p_confirmed_at: at };
    }, requestEvent.meeting_id, "Décision enregistrée avec son motif. Le pointage original est conservé.");
    return true;
  }
  function decorateCensor(host, meetings, records, data) {
    if (!host || !host.isConnected) return;
    if (data && !data.unavailable && data.account === me()) cache = data;
    meetings.forEach(function (meeting) { knownMeetings[meeting.id] = meeting; });
    Object.keys(records || {}).forEach(function (key) { var record = records[key]; if (record && record.meet && record.email) knownRecords[emailKey(record.meet, record.email)] = record; });
    host.querySelectorAll("details.mt-m").forEach(function (section) {
      var anchor = section.querySelector("[data-csdel]"), existing = section.querySelector(".af-att-review");
      if (!anchor) return;
      if (existing) existing.remove();
      var meetingId = anchor.dataset.csdel, panel = document.createElement("section"); panel.className = "af-att-review";
      if (!data || data.unavailable) panel.innerHTML = '<p role="alert">Vérifications indisponibles. Actualisez avant de conclure sur une présence.</p>';
      else {
        var requests = [];
        Object.keys(data.events).forEach(function (key) { data.events[key].forEach(function (event) { if (event.kind === "request" && event.meeting_id === meetingId) requests.push(event); }); });
        requests.sort(eventOrder);
        if (!requests.length) return;
        panel.innerHTML = '<h4>Vérifications des présences</h4><p class="af-att-zone">Fuseau d’affichage : ' + esc(zone()) + '. Les déclarations et décisions restent distinctes du pointage.</p>'
          + requests.map(function (event) {
            var options = context(data, meetingId, event.member_email), decisions = options.events.filter(function (d) { return d.kind === "decision" && d.request_id === event.id; }).sort(eventOrder), decision = decisions[decisions.length - 1];
            var record = knownRecords[emailKey(meetingId, event.member_email)], value = status(knownMeetings[meetingId], record, options);
            return '<article class="af-att-case"><b>' + esc(event.member_email) + '</b><small>Demande reçue le ' + esc(dateLabel(event.created_at)) + '</small><p>' + esc(event.reason) + '</p>'
              + '<p>Arrivée déclarée par le membre : ' + esc(dateLabel(event.occurred_at)) + ' (à vérifier).</p>' + evidenceHTML(record, value)
              + (decision ? '<p><b>' + esc(decision.outcome === "rejected" ? "Demande refusée" : (OUTCOMES[decision.outcome] || { t: "Décision enregistrée" }).t) + '</b> · ' + esc(decision.actor_email) + ' · ' + esc(dateLabel(decision.created_at)) + '</p><p>' + esc(decision.reason) + '</p>' + (decision.occurred_at ? '<p>Heure confirmée : ' + esc(dateLabel(decision.occurred_at)) + '</p>' : '')
                : String(event.member_email).toLowerCase() === me() ? '<p>Votre demande doit être examinée par un autre responsable.</p>' : '<button type="button" data-att-review="' + esc(event.id) + '">Examiner cette demande</button>') + '</article>';
          }).join("");
      }
      anchor.parentNode.before(panel);
    });
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-att-request],[data-att-review]");
    if (!button) return;
    if (button.dataset.attRequest) request(button.dataset.attRequest); else review(button.dataset.attReview);
  });
  window.addEventListener("afriflow:navigate", function (event) { if (!event.detail || !["personal", "censor"].includes(event.detail.id)) closeDialog(); });
  window.addEventListener("afriflow:auth-ready", function () { if (dialog && dialog.owner !== me()) closeDialog(); if (cache && cache.account !== me()) { cache = null; knownRecords = {}; } });
  window.AfriAttendance = { status: status, load: load, loadPersonal: loadPersonal, context: context, request: request, review: review,
    renderPersonal: renderPersonal, decorateCensor: decorateCensor, isReviewing: function () { return !!dialog; } };
})();
