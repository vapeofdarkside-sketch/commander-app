
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  session: null,
  profile: null,
  games: [],
  votes: [],
  members: [],
  pending: [],
  deferredPrompt: null,
  viewedMemberId: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function initials(value = "") {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : value.slice(0,2)).toUpperCase();
}
function formatDate(date) {
  return new Date(date + "T12:00:00").toLocaleDateString("de-DE", {
    weekday:"short", day:"2-digit", month:"long", year:"numeric"
  });
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
function setBusy(form, busy) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  button.disabled = busy;
  button.dataset.oldText ||= button.textContent;
  button.textContent = busy ? "Bitte warten …" : button.dataset.oldText;
}
function showOnly(id) {
  ["loadingScreen","authScreen","pendingScreen","appShell"].forEach(name => {
    $("#" + name).classList.toggle("hidden", name !== id);
  });
}
function isDeveloper() {
  return state.profile?.is_developer === true;
}
function isAdmin() {
  return isDeveloper() || state.profile?.role === "admin";
}
function setAdminUi() {
  $$(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin()));
}
function nav(view) {
  $$(".view").forEach(el => el.classList.toggle("active", el.id === view + "View"));
  $$(".bottom-nav [data-view]").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  window.scrollTo({ top:0, behavior:"smooth" });
}

async function fetchProfile() {
  if (!state.session?.user?.id) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", state.session.user.id)
    .single();
  if (error) throw error;
  return data;
}

async function loadAppData() {
  state.profile = await fetchProfile();

  if (state.profile.status !== "approved") {
    showOnly("pendingScreen");
    return;
  }

  const gamesQuery = supabase
    .from("games")
    .select("*")
    .order("date", { ascending:true })
    .order("time", { ascending:true });

  const votesQuery = isAdmin()
    ? supabase.from("votes").select("*")
    : supabase
        .from("votes")
        .select("*")
        .eq("user_id", state.session.user.id);

  const [{ data:games, error:gamesError }, { data:votes, error:votesError }] =
    await Promise.all([gamesQuery, votesQuery]);

  if (gamesError) throw gamesError;
  if (votesError) throw votesError;

  state.games = games || [];
  state.votes = votes || [];

  if (isAdmin()) {
    const { data:members, error:membersError } = await supabase
      .from("profiles")
      .select("*")
      .order("status", { ascending:true })
      .order("callsign", { ascending:true });
    if (membersError) throw membersError;
    state.members = (members || []).filter(x => x.status === "approved");
    state.pending = (members || []).filter(x => x.status === "pending");
  } else {
    state.members = [];
    state.pending = [];
  }

  renderAll();
  showOnly("appShell");
}

function voteFor(gameId) {
  return state.votes.find(v => v.game_id === gameId && v.user_id === state.session?.user?.id);
}
function futureGames() {
  const now = new Date();
  return state.games.filter(g => new Date(`${g.date}T${g.time || "00:00"}`) >= now);
}

function renderAll() {
  setAdminUi();

  const callsign = state.profile.callsign || state.profile.name || "Spieler";
  $("#welcomeTitle").textContent = `Willkommen, ${callsign}.`;
  $("#welcomeSubtitle").textContent = isDeveloper()
    ? "Developer-Zentrale"
    : isAdmin() ? "Admin-Zentrale" : "Deine Teamübersicht";
  $("#headerSubtitle").textContent = isDeveloper()
    ? "Developer"
    : isAdmin() ? "Admin" : state.profile.position;
  $("#profileButton").textContent = initials(callsign);

  $("#pendingCount").textContent = state.pending.length;

  $("#profileAvatar").textContent = initials(callsign);
  $("#profileCallsign").textContent = callsign;
  $("#profileName").textContent = state.profile.name || state.session.user.email;
  $("#profilePosition").textContent = state.profile.position;

  renderDashboard();
  renderGames();
  if (isAdmin()) {
    renderTeam();
    renderParticipationOverview();
  }
}

function renderDashboard() {
  const upcoming = futureGames();
  const next = upcoming[0];

  if (!next) {
    $("#nextGameTitle").textContent = "Noch nichts geplant";
    $("#nextGameMeta").textContent = isAdmin()
      ? "Erstelle den ersten Spieltag auf der Spieltage-Seite."
      : "Ein Admin kann einen Spieltag erstellen.";
  } else {
    $("#nextGameTitle").textContent = next.title;
    $("#nextGameMeta").textContent =
      `${formatDate(next.date)} · ${next.time.slice(0,5)} Uhr · ${next.location}`;
  }

  $("#dashboardGames").innerHTML = upcoming.slice(0,3).map(dashboardGameCardHtml).join("")
    || `<div class="empty">Keine kommenden Spieltage vorhanden.</div>`;
}

function safeWebsiteUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function gameWebsiteHtml(game) {
  const url = safeWebsiteUrl(game.website_url);
  if (!url) return "";
  return `<a class="game-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Website öffnen ↗</a>`;
}

function dashboardGameCardHtml(game) {
  const ownVote = voteFor(game.id)?.response;
  const statusText = ownVote === "yes" ? "Zugesagt" : ownVote === "no" ? "Abgesagt" : "Offen";
  const statusClass = ownVote || "open";

  return `
    <article class="card dashboard-game-card">
      <div class="card-head">
        <div>
          <div class="date-label">${escapeHtml(formatDate(game.date))} · ${escapeHtml(game.time.slice(0,5))} UHR</div>
          <h3>${escapeHtml(game.title)}</h3>
          <div class="meta">${escapeHtml(game.location)}</div>
        </div>
        <span class="status-pill ${statusClass}">${statusText}</span>
      </div>
      ${game.description ? `<p class="description">${escapeHtml(game.description)}</p>` : ""}
      ${gameWebsiteHtml(game)}
    </article>
  `;
}

function gameCardHtml(game) {
  const ownVote = voteFor(game.id)?.response;
  const statusText = ownVote === "yes" ? "Zugesagt" : ownVote === "no" ? "Abgesagt" : "Offen";
  const statusClass = ownVote || "open";

  return `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="date-label">${escapeHtml(formatDate(game.date))} · ${escapeHtml(game.time.slice(0,5))} UHR</div>
          <h3>${escapeHtml(game.title)}</h3>
          <div class="meta">${escapeHtml(game.location)}</div>
        </div>
        <span class="status-pill ${statusClass}">${statusText}</span>
      </div>
      ${game.description ? `<p class="description">${escapeHtml(game.description)}</p>` : ""}
      ${gameWebsiteHtml(game)}
      <div class="card-actions">
        <button class="yes" data-vote="yes" data-game-id="${game.id}">Ja</button>
        <button class="no" data-vote="no" data-game-id="${game.id}">Nein</button>
        ${isAdmin() ? `
          <button data-edit-game="${game.id}">Bearbeiten</button>
          <button class="delete" data-delete-game="${game.id}">Löschen</button>
        ` : ""}
      </div>
    </article>
  `;
}

function renderGames() {
  $("#gamesList").innerHTML = state.games.map(gameCardHtml).join("")
    || `<div class="empty">Noch keine Spieltage vorhanden.</div>`;
}

function participantChip(member) {
  const label = member.callsign || member.name || "Mitglied";
  return `<span class="participant-chip"><span>${escapeHtml(initials(label))}</span>${escapeHtml(label)}</span>`;
}
function renderParticipantList(elementId, members) {
  const element = $(elementId);
  element.innerHTML = members.length ? members.map(participantChip).join("") : `<span class="participant-empty">Niemand</span>`;
}
function renderParticipationOverview() {
  if (!isAdmin()) return;
  const select = $("#participationGameSelect");
  const games = [...state.games].sort((a,b)=>new Date(`${a.date}T${a.time}`)-new Date(`${b.date}T${b.time}`));
  if (!games.length) {
    select.innerHTML = `<option value="">Noch kein Spieltag vorhanden</option>`;
    renderParticipantList("#attendingMembers", []);
    renderParticipantList("#decliningMembers", []);
    renderParticipantList("#unansweredMembers", state.members);
    $("#attendingCount").textContent = "0 Zusagen";
    $("#decliningCount").textContent = "0 Absagen";
    $("#unansweredCount").textContent = `${state.members.length} offen`;
    return;
  }
  const previousSelection = select.value;
  select.innerHTML = games.map(game => `<option value="${game.id}">${escapeHtml(formatDate(game.date))} – ${escapeHtml(game.title)}</option>`).join("");
  const selectedExists = games.some(game => game.id === previousSelection);
  select.value = selectedExists ? previousSelection : (futureGames()[0]?.id || games[games.length-1].id);
  updateParticipationLists();
}
function updateParticipationLists() {
  if (!isAdmin()) return;
  const gameId = $("#participationGameSelect").value;
  const gameVotes = state.votes.filter(v => v.game_id === gameId);
  const voteMap = new Map(gameVotes.map(v => [v.user_id, v.response]));
  const attending = state.members.filter(m => voteMap.get(m.user_id) === "yes");
  const declining = state.members.filter(m => voteMap.get(m.user_id) === "no");
  const unanswered = state.members.filter(m => !voteMap.has(m.user_id));
  renderParticipantList("#attendingMembers", attending);
  renderParticipantList("#decliningMembers", declining);
  renderParticipantList("#unansweredMembers", unanswered);
  $("#attendingCount").textContent = `${attending.length} ${attending.length===1?"Zusage":"Zusagen"}`;
  $("#decliningCount").textContent = `${declining.length} ${declining.length===1?"Absage":"Absagen"}`;
  $("#unansweredCount").textContent = `${unanswered.length} offen`;
}

function renderTeam() {
  $("#pendingMembersList").innerHTML = state.pending.map(member => `
    <article class="card">
      <div class="member-row">
        <div class="member-avatar">${escapeHtml(initials(member.callsign || member.name))}</div>
        <div class="member-main">
          <strong>${escapeHtml(member.callsign || "Ohne Callsign")}</strong>
          <span>${escapeHtml(member.name || "")} · ${escapeHtml(member.email || "")}</span>
        </div>
      </div>
      <div class="approval-actions">
        <button class="primary" data-approve-member="${member.user_id}">Freigeben</button>
        <button class="danger" data-reject-member="${member.user_id}">Ablehnen</button>
      </div>
    </article>
  `).join("") || `<div class="empty">Keine offenen Freigaben.</div>`;

  $("#membersList").innerHTML = state.members.map(member => `
    <article class="card">
      <div class="member-row">
        <div class="member-avatar">${escapeHtml(initials(member.callsign || member.name))}</div>
        <div class="member-main">
          <strong>${escapeHtml(member.callsign || "Ohne Callsign")}</strong>
          <span>${escapeHtml(member.name || "")} · ${escapeHtml(member.position)}${member.is_developer ? " · Developer" : member.role === "admin" ? " · Admin" : ""}</span>
        </div>
      </div>
      <div class="card-actions">
        ${member.is_developer && !isDeveloper()
          ? `
              <button class="details" data-view-member="${member.user_id}">Daten</button>
              <button type="button" disabled class="protected-member">Developer geschützt</button>
            `
          : `
              <button data-edit-member="${member.user_id}">Bearbeiten</button>
              <button class="details" data-view-member="${member.user_id}">Daten</button>
              ${member.is_developer ? "" : `<button class="delete" data-delete-member="${member.user_id}">Profil löschen</button>`}
            `}
      </div>
    </article>
  `).join("") || `<div class="empty">Noch keine freigegebenen Mitglieder.</div>`;
}

async function castVote(gameId, response) {
  try {
    const { error } = await supabase
      .from("votes")
      .upsert({
        game_id: gameId,
        user_id: state.session.user.id,
        response
      }, { onConflict:"game_id,user_id" });
    if (error) throw error;

    const existing = state.votes.find(v => v.game_id === gameId);
    if (existing) existing.response = response;
    else state.votes.push({ game_id:gameId, user_id:state.session.user.id, response });

    renderDashboard();
    renderGames();
    toast(response === "yes" ? "Du hast zugesagt." : "Du hast abgesagt.");
  } catch (error) {
    toast(error.message || "Abstimmung fehlgeschlagen.");
  }
}

function openModal(id) {
  $("#" + id).classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  $("#" + id).classList.add("hidden");
  document.body.style.overflow = "";
}
function resetGameForm() {
  $("#gameForm").reset();
  $("#gameId").value = "";
  $("#gameModalTitle").textContent = "Spieltag erstellen";
  const date = new Date();
  date.setDate(date.getDate() + 7);
  $("#gameDateInput").value = date.toISOString().slice(0,10);
  $("#gameTimeInput").value = "09:00";
}

async function approveMember(userId) {
  const { error } = await supabase
    .from("profiles")
    .update({ status:"approved" })
    .eq("user_id", userId);
  if (error) return toast(error.message);
  toast("Mitglied freigegeben.");
  await loadAppData();
}
async function rejectMember(userId) {
  if (!confirm("Dieses Konto wirklich ablehnen?")) return;
  const { error } = await supabase
    .from("profiles")
    .update({ status:"rejected" })
    .eq("user_id", userId);
  if (error) return toast(error.message);
  toast("Konto abgelehnt.");
  await loadAppData();
}


async function deleteMember(userId) {
  const member = state.members.find(m => m.user_id === userId);
  if (!member) return;

  if (member.is_developer) {
    toast("Developer-Konten können nicht gelöscht werden.");
    return;
  }

  const label = member.callsign || member.name || "dieses Mitglied";
  if (!confirm(`${label} wirklich vollständig aus AirsoftbrotherhoodNRW löschen?\n\nDas Benutzerkonto, Profil und alle Abstimmungen werden dauerhaft entfernt.`)) {
    return;
  }

  try {
    const { error } = await supabase.rpc("admin_delete_member", {
      target_user_id: userId
    });
    if (error) throw error;

    toast("Mitglied vollständig gelöscht.");
    await loadAppData();
  } catch (error) {
    toast(error.message || "Mitglied konnte nicht gelöscht werden.");
  }
}


function formatPrivateDate(value) {
  if (!value) return "Nicht angegeben";
  return new Date(`${value}T12:00:00`).toLocaleDateString("de-DE");
}

function memberDetailRow(label, value, options = {}) {
  const cleanValue = value || "Nicht angegeben";
  let content = escapeHtml(cleanValue);

  if (options.type === "email" && value) {
    content = `<a href="mailto:${escapeHtml(value)}">${escapeHtml(value)}</a>`;
  } else if (options.type === "phone" && value) {
    const phoneHref = String(value).replace(/[^\d+]/g, "");
    content = `<a href="tel:${escapeHtml(phoneHref)}">${escapeHtml(value)}</a>`;
  }

  return `
    <div class="member-detail-row ${options.sensitive ? "sensitive" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${content}</strong>
    </div>
  `;
}

function viewMemberDetails(userId) {
  const member = state.members.find(m => m.user_id === userId);
  if (!member || !isAdmin()) return;

  state.viewedMemberId = userId;
  $("#memberDetailsTitle").textContent = member.callsign || member.name || "Mitgliedsdaten";
  $("#editPrivateDataButton").classList.toggle("hidden", !isDeveloper());
  $("#memberDetailsContent").innerHTML = [
    memberDetailRow("Name", member.name),
    memberDetailRow("Callsign", member.callsign),
    memberDetailRow("Geburtsdatum", formatPrivateDate(member.birth_date)),
    memberDetailRow("E-Mail", member.email, { type: "email" }),
    memberDetailRow("Handynummer", member.phone, { type: "phone" }),
    memberDetailRow("Wohnadresse", member.address),
    memberDetailRow("Notfallkontakt", member.emergency_contact_name),
    memberDetailRow("Notfallnummer", member.emergency_contact_phone, { type: "phone" }),
    memberDetailRow("T-Shirt-Größe", member.tshirt_size),
    memberDetailRow("Hoodie-Größe", member.hoodie_size),
    memberDetailRow("Kopfbedeckungsgröße", member.headwear_size),
    memberDetailRow("Erkrankungen / medizinische Hinweise", member.medical_notes, { sensitive: true }),
    memberDetailRow("Position", member.position),
    memberDetailRow("Rechte", member.is_developer ? "Developer" : member.role === "admin" ? "Admin" : "Mitglied")
  ].join("");

  openModal("memberDetailsModal");
}


function openPrivateDataEditor(userId) {
  if (!isDeveloper()) {
    toast("Nur Developer dürfen persönliche Daten bearbeiten.");
    return;
  }

  const member = state.members.find(m => m.user_id === userId);
  if (!member) return;

  $("#privateDataUserId").value = member.user_id;
  $("#privateName").value = member.name || "";
  $("#privateCallsign").value = member.callsign || "";
  $("#privateBirthDate").value = member.birth_date || "";
  $("#privateEmail").value = member.email || "";
  $("#privatePhone").value = member.phone || "";
  $("#privateAddress").value = member.address || "";
  $("#privateEmergencyName").value = member.emergency_contact_name || "";
  $("#privateEmergencyPhone").value = member.emergency_contact_phone || "";
  $("#privateTshirtSize").value = member.tshirt_size || "";
  $("#privateHoodieSize").value = member.hoodie_size || "";
  $("#privateHeadwearSize").value = member.headwear_size || "";
  $("#privateMedicalNotes").value = member.medical_notes || "";

  closeModal("memberDetailsModal");
  openModal("privateDataModal");
}

async function savePrivateData(event) {
  event.preventDefault();

  if (!isDeveloper()) {
    toast("Nur Developer dürfen persönliche Daten bearbeiten.");
    return;
  }

  setBusy(event.currentTarget, true);
  try {
    const payload = {
      target_user_id: $("#privateDataUserId").value,
      new_name: $("#privateName").value.trim(),
      new_callsign: $("#privateCallsign").value.trim(),
      new_birth_date: $("#privateBirthDate").value,
      new_phone: $("#privatePhone").value.trim(),
      new_address: $("#privateAddress").value.trim(),
      new_emergency_contact_name: $("#privateEmergencyName").value.trim(),
      new_emergency_contact_phone: $("#privateEmergencyPhone").value.trim(),
      new_tshirt_size: $("#privateTshirtSize").value.trim(),
      new_hoodie_size: $("#privateHoodieSize").value.trim(),
      new_headwear_size: $("#privateHeadwearSize").value.trim(),
      new_medical_notes: $("#privateMedicalNotes").value.trim()
    };

    const { error } = await supabase.rpc("developer_update_member_data", payload);
    if (error) throw error;

    closeModal("privateDataModal");
    toast("Mitgliedsdaten gespeichert.");
    await loadAppData();
  } catch (error) {
    toast(error.message || "Daten konnten nicht gespeichert werden.");
  } finally {
    setBusy(event.currentTarget, false);
  }
}

function editMember(userId) {
  const member = state.members.find(m => m.user_id === userId);
  if (!member) return;
  if (member.is_developer && !isDeveloper()) {
    toast("Developer-Konten sind für Admins geschützt.");
    return;
  }
  $("#memberUserId").value = member.user_id;
  $("#memberPositionInput").value = member.position || "Member";
  $("#memberRoleInput").value = member.role || "member";
  openModal("memberModal");
}

async function saveMember(event) {
  event.preventDefault();
  setBusy(event.currentTarget, true);
  try {
    const userId = $("#memberUserId").value;
    const member = state.members.find(m => m.user_id === userId);
    if (member?.is_developer && !isDeveloper()) {
      throw new Error("Developer-Konten sind für Admins geschützt.");
    }
    const changes = {
      position: $("#memberPositionInput").value,
      role: $("#memberRoleInput").value
    };
    const { error } = await supabase.from("profiles").update(changes).eq("user_id", userId);
    if (error) throw error;
    closeModal("memberModal");
    toast("Mitglied gespeichert.");
    await loadAppData();
  } catch (error) {
    toast(error.message || "Speichern fehlgeschlagen.");
  } finally {
    setBusy(event.currentTarget, false);
  }
}

async function saveGame(event) {
  event.preventDefault();
  setBusy(event.currentTarget, true);
  try {
    const id = $("#gameId").value;
    const payload = {
      title: $("#gameTitleInput").value.trim(),
      date: $("#gameDateInput").value,
      time: $("#gameTimeInput").value,
      location: $("#gameLocationInput").value.trim(),
      description: $("#gameDescriptionInput").value.trim(),
      website_url: $("#gameWebsiteInput").value.trim(),
      created_by: state.session.user.id
    };
    let result;
    if (id) {
      delete payload.created_by;
      result = await supabase.from("games").update(payload).eq("id", id);
    } else {
      result = await supabase.from("games").insert(payload);
    }
    if (result.error) throw result.error;
    closeModal("gameModal");
    toast(id ? "Spieltag geändert." : "Spieltag erstellt.");
    await loadAppData();
  } catch (error) {
    toast(error.message || "Speichern fehlgeschlagen.");
  } finally {
    setBusy(event.currentTarget, false);
  }
}

function editGame(id) {
  const game = state.games.find(g => g.id === id);
  if (!game) return;
  $("#gameId").value = game.id;
  $("#gameTitleInput").value = game.title;
  $("#gameDateInput").value = game.date;
  $("#gameTimeInput").value = game.time.slice(0,5);
  $("#gameLocationInput").value = game.location;
  $("#gameDescriptionInput").value = game.description || "";
  $("#gameWebsiteInput").value = game.website_url || "";
  $("#gameModalTitle").textContent = "Spieltag bearbeiten";
  openModal("gameModal");
}

async function deleteGame(id) {
  if (!confirm("Spieltag wirklich löschen?")) return;
  const { error } = await supabase.from("games").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Spieltag gelöscht.");
  await loadAppData();
}

async function handleLogin(event) {
  event.preventDefault();
  setBusy(event.currentTarget, true);
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: $("#loginEmail").value.trim(),
      password: $("#loginPassword").value
    });
    if (error) throw error;
  } catch (error) {
    toast(error.message === "Invalid login credentials"
      ? "E-Mail oder Passwort ist falsch."
      : error.message);
  } finally {
    setBusy(event.currentTarget, false);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  setBusy(event.currentTarget, true);
  try {
    const email = $("#registerEmail").value.trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: $("#registerPassword").value,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          name: $("#registerName").value.trim(),
          callsign: $("#registerCallsign").value.trim(),
          birth_date: $("#registerBirthDate").value,
          phone: $("#registerPhone").value.trim(),
          address: $("#registerAddress").value.trim(),
          emergency_contact_name: $("#registerEmergencyName").value.trim(),
          emergency_contact_phone: $("#registerEmergencyPhone").value.trim(),
          tshirt_size: $("#registerTshirtSize").value.trim(),
          hoodie_size: $("#registerHoodieSize").value.trim(),
          headwear_size: $("#registerHeadwearSize").value.trim(),
          medical_notes: $("#registerMedicalNotes").value.trim(),
          rules_accepted: $("#registerRulesAccepted").checked,
          privacy_accepted: $("#registerPrivacyAccepted").checked
        }
      }
    });
    if (error) throw error;

    if (!data.session) {
      toast("Bestätigungs-E-Mail wurde gesendet.");
      $("#showLoginBtn").click();
    } else {
      toast("Konto erstellt.");
    }
  } catch (error) {
    toast(error.message || "Registrierung fehlgeschlagen.");
  } finally {
    setBusy(event.currentTarget, false);
  }
}

async function forgotPassword() {
  const email = $("#loginEmail").value.trim();
  if (!email) return toast("Trage zuerst deine E-Mail ein.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  toast(error ? error.message : "E-Mail zum Zurücksetzen wurde gesendet.");
}

function showAuthMode(mode) {
  const login = mode === "login";
  $("#loginForm").classList.toggle("hidden", !login);
  $("#registerForm").classList.toggle("hidden", login);
  $("#showLoginBtn").classList.toggle("active", login);
  $("#showRegisterBtn").classList.toggle("active", !login);
}

async function initialize() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;

  if (!state.session) {
    showOnly("authScreen");
  } else {
    try {
      await loadAppData();
    } catch (error) {
      console.error(error);
      toast("Datenbank noch nicht eingerichtet oder nicht erreichbar.");
      showOnly("authScreen");
    }
  }
}

supabase.auth.onAuthStateChange(async (_event, session) => {
  state.session = session;
  if (!session) {
    state.profile = null;
    showOnly("authScreen");
    return;
  }
  try {
    await loadAppData();
  } catch (error) {
    console.error(error);
    toast("Anmeldung erfolgreich, Datenbank-Setup fehlt noch.");
  }
});

$("#showLoginBtn").addEventListener("click", () => showAuthMode("login"));
$("#showRegisterBtn").addEventListener("click", () => showAuthMode("register"));
$("#loginForm").addEventListener("submit", handleLogin);
$("#registerForm").addEventListener("submit", handleRegister);
$("#forgotPasswordBtn").addEventListener("click", forgotPassword);
$("#logoutButton").addEventListener("click", () => supabase.auth.signOut());
$("#pendingLogoutBtn").addEventListener("click", () => supabase.auth.signOut());
$("#pendingRefreshBtn").addEventListener("click", async () => {
  try {
    await loadAppData();
    if (state.profile?.status !== "approved") toast("Freigabe steht noch aus.");
  } catch (error) { toast(error.message); }
});
$("#profileButton").addEventListener("click", () => nav("profile"));
$("#addGameButton").addEventListener("click", () => {
  resetGameForm();
  openModal("gameModal");
});
$("#gameForm").addEventListener("submit", saveGame);
$("#memberForm").addEventListener("submit", saveMember);
$("#privateDataForm").addEventListener("submit", savePrivateData);
$("#editPrivateDataButton").addEventListener("click", () => {
  if (state.viewedMemberId) openPrivateDataEditor(state.viewedMemberId);
});
$("#participationGameSelect").addEventListener("change", updateParticipationLists);

$$("[data-close-modal]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});
$$(".modal").forEach(modal => {
  modal.addEventListener("click", event => {
    if (event.target === modal) closeModal(modal.id);
  });
});
$$(".bottom-nav [data-view]").forEach(btn => {
  btn.addEventListener("click", () => nav(btn.dataset.view));
});
$$("[data-go]").forEach(btn => {
  btn.addEventListener("click", () => nav(btn.dataset.go));
});

document.addEventListener("click", event => {
  const voteButton = event.target.closest("[data-vote]");
  if (voteButton) castVote(voteButton.dataset.gameId, voteButton.dataset.vote);

  const editGameButton = event.target.closest("[data-edit-game]");
  if (editGameButton) editGame(editGameButton.dataset.editGame);

  const deleteGameButton = event.target.closest("[data-delete-game]");
  if (deleteGameButton) deleteGame(deleteGameButton.dataset.deleteGame);

  const approveButton = event.target.closest("[data-approve-member]");
  if (approveButton) approveMember(approveButton.dataset.approveMember);

  const rejectButton = event.target.closest("[data-reject-member]");
  if (rejectButton) rejectMember(rejectButton.dataset.rejectMember);

  const editMemberButton = event.target.closest("[data-edit-member]");
  if (editMemberButton) editMember(editMemberButton.dataset.editMember);

  const viewMemberButton = event.target.closest("[data-view-member]");
  if (viewMemberButton) viewMemberDetails(viewMemberButton.dataset.viewMember);

  const deleteMemberButton = event.target.closest("[data-delete-member]");
  if (deleteMemberButton) deleteMember(deleteMemberButton.dataset.deleteMember);
});


function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function showInstallHelp(force = false) {
  if (isStandaloneMode()) return;

  const dismissed = localStorage.getItem("airsoftbrotherhoodnrw-install-help-v641") === "1";
  if (!force && dismissed) return;

  $("#androidInstallHelp").classList.add("hidden");
  $("#iosInstallHelp").classList.add("hidden");
  $("#genericInstallHelp").classList.add("hidden");

  if (isIOSDevice()) {
    $("#iosInstallHelp").classList.remove("hidden");
  } else if (state.deferredPrompt) {
    $("#androidInstallHelp").classList.remove("hidden");
  } else {
    $("#genericInstallHelp").classList.remove("hidden");
  }

  openModal("installHelpModal");
}

function dismissInstallHelp() {
  localStorage.setItem("airsoftbrotherhoodnrw-install-help-v641", "1");
  closeModal("installHelpModal");
}

async function triggerNativeInstall() {
  if (!state.deferredPrompt) {
    showInstallHelp(true);
    return;
  }

  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
  $("#installButton").classList.add("hidden");
  closeModal("installHelpModal");
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  state.deferredPrompt = event;
  $("#installButton").classList.remove("hidden");

  // Falls der Hinweis gerade schon als allgemeine Variante offen ist,
  // neu rendern, damit Android direkt "App installieren" anbietet.
  if (!$("#installHelpModal").classList.contains("hidden")) {
    showInstallHelp(true);
  } else {
    window.setTimeout(() => showInstallHelp(false), 500);
  }
});

$("#installButton").addEventListener("click", () => showInstallHelp(true));
$("#installNowButton").addEventListener("click", triggerNativeInstall);
$("#androidInstallLaterButton").addEventListener("click", dismissInstallHelp);
$("#iosInstallUnderstoodButton").addEventListener("click", dismissInstallHelp);
$("#genericInstallUnderstoodButton").addEventListener("click", dismissInstallHelp);

window.addEventListener("appinstalled", () => {
  state.deferredPrompt = null;
  localStorage.setItem("airsoftbrotherhoodnrw-install-help-v641", "1");
  $("#installButton").classList.add("hidden");
  closeModal("installHelpModal");
});

window.addEventListener("load", () => {
  if (isStandaloneMode()) return;

  // Auf iPhone/iPad gibt es keinen nativen Installationsdialog.
  // Auf Android kann beforeinstallprompt etwas später eintreffen.
  // Deshalb zeigen wir auf beiden Plattformen einmal pro App-Version
  // unseren eigenen Hinweis und wechseln auf Android automatisch
  // zum nativen Installieren-Button, sobald der Browser ihn anbietet.
  window.setTimeout(() => showInstallHelp(false), 1000);
});


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js?v=641", { updateViaCache: "none" }));
}

initialize();
