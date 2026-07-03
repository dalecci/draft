// ============================================================================
// J3Prep — Student Portal SPA
// ============================================================================
(function () {
  "use strict";

  // ---------------------------- State ---------------------------------------
  const state = {
    cfg: null,                 // { supabaseUrl, supabaseAnon, adminPin }
    supa: null,                // Supabase client
    students: [],              // roster (loaded after config + on login screen)
    me: null,                  // logged-in student
    session: null,             // active session row { id, ... }
    sessionPlan: [],           // array of skill_ids for this session
    currentSkillIdx: 0,
    currentSkillId: null,      // active skill (drives topic picker + lesson_intro gating)
    introducedSkills: new Set(),  // skills we've shown a lesson for this session
    allSkills: [],             // full skills list (loaded once for picker)
    currentQuestion: null,     // { question, expected_answer, skill_id, ... }
    hintLevel: 0,
    sessionStats: { asked: 0, correct: 0 },
    parentUnlocked: false,
    adminUnlocked: false,
  };

  // ---------------------------- Boot ----------------------------------------
  document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    loadConfig();
    bindGlobalEvents();
    if (!state.cfg || !state.cfg.supabaseUrl || !state.cfg.supabaseAnon) {
      showSetup(/*returnTo*/"login");
      return;
    }
    initSupabase();
    await loadRosterIntoLogin();
    showLogin();
  }

  function loadConfig() {
    try { state.cfg = JSON.parse(localStorage.getItem("j3prep.cfg") || "null"); }
    catch { state.cfg = null; }
  }
  function saveConfig(cfg) {
    state.cfg = cfg;
    localStorage.setItem("j3prep.cfg", JSON.stringify(cfg));
  }

  function initSupabase() {
    state.supa = window.supabase.createClient(state.cfg.supabaseUrl, state.cfg.supabaseAnon);
  }

  function bindGlobalEvents() {
    // Setup view
    $("#saveCfgBtn").onclick = onSaveCfg;
    $("#cancelCfgBtn").onclick = () => { showLogin(); };
    $("#settingsBtn").onclick = () => showSetup("login");

    // Login
    $("#loginBtn").onclick = onLogin;
    $("#loginPin").addEventListener("keydown", (e) => { if (e.key === "Enter") onLogin(); });
    $("#logoutBtn").onclick = onLogout;

    // Tabs
    document.querySelectorAll(".tab").forEach((b) => {
      b.addEventListener("click", () => switchTab(b.dataset.view));
    });

    // Session
    $("#startSessionBtn").onclick = startSession;
    $("#submitAnswerBtn").onclick = submitAnswer;
    $("#skipBtn").onclick = submitForfeit;
    $("#nextQBtn").onclick = nextQuestion;
    $("#endSessionBtn").onclick = endSession;
    $("#newSessionBtn").onclick = () => { resetSessionUI(); startSession(); };
    $("#answerInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submitAnswer(); });
    $("#topicPicker").addEventListener("change", onTopicPicked);
    $("#startQuestionsBtn").onclick = startQuestionsFromLesson;

    // Parent/Admin gates
    $("#parentPinBtn").onclick = () => unlockGate("parent");
    $("#adminPinBtn").onclick = () => unlockGate("admin");
    $("#parentPin").addEventListener("keydown", (e) => { if (e.key === "Enter") unlockGate("parent"); });
    $("#adminPin").addEventListener("keydown", (e) => { if (e.key === "Enter") unlockGate("admin"); });

    // Admin
    $("#addStudentBtn").onclick = addStudent;
  }

  // ---------------------------- Setup ---------------------------------------
  function showSetup(returnTo) {
    hideAll();
    $("#setupView").classList.remove("hidden");
    if (state.cfg) {
      $("#cfgUrl").value = state.cfg.supabaseUrl || "";
      $("#cfgAnon").value = state.cfg.supabaseAnon || "";
      $("#cfgAdminPin").value = state.cfg.adminPin || "";
    }
    state._returnTo = returnTo;
  }

  function onSaveCfg() {
    const cfg = {
      supabaseUrl: $("#cfgUrl").value.trim().replace(/\/+$/, ""),
      supabaseAnon: $("#cfgAnon").value.trim(),
      adminPin: $("#cfgAdminPin").value.trim() || "4545",
    };
    if (!cfg.supabaseUrl || !cfg.supabaseAnon) {
      toast("Supabase URL and anon key are required", true);
      return;
    }
    saveConfig(cfg);
    initSupabase();
    loadRosterIntoLogin().then(showLogin);
  }

  // ---------------------------- Login ---------------------------------------
  async function loadRosterIntoLogin() {
    const sel = $("#loginName");
    sel.innerHTML = `<option value="">— select —</option>`;
    if (!state.supa) return;
    const { data, error } = await state.supa.from("j3prep_students").select("id, name").order("name");
    if (error) {
      toast("Couldn't load students: " + error.message, true);
      return;
    }
    state.students = data || [];
    state.students.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
    if (state.students.length === 0) {
      toast("No students yet — use Admin tab to add one", false);
    }
  }

  function showLogin() {
    hideAll();
    $("#topbar").classList.add("hidden");
    $("#loginView").classList.remove("hidden");
  }

  async function onLogin() {
    const id = $("#loginName").value;
    const pin = $("#loginPin").value.trim();
    if (!id || !pin) { showLoginError("Pick your name and enter your PIN."); return; }

    const { data, error } = await state.supa
      .from("j3prep_students").select("*").eq("id", id).single();
    if (error || !data) { showLoginError("Couldn't find that student."); return; }
    if (data.pin !== pin) { showLoginError("Wrong PIN."); return; }

    state.me = data;
    $("#loginError").classList.add("hidden");
    $("#loginPin").value = "";
    enterApp();
  }

  function showLoginError(msg) {
    const el = $("#loginError");
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function onLogout() {
    state.me = null;
    state.session = null;
    state.parentUnlocked = false;
    state.adminUnlocked = false;
    showLogin();
  }

  function enterApp() {
    hideAll();
    $("#topbar").classList.remove("hidden");
    $("#whoLabel").textContent = state.me.name;
    switchTab("session");
  }

  // ---------------------------- Tab routing ---------------------------------
  function switchTab(view) {
    document.querySelectorAll(".tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view);
    });
    ["sessionView", "progressView", "parentView", "adminView"].forEach((id) => {
      $("#" + id).classList.add("hidden");
    });

    if (view === "session")  { $("#sessionView").classList.remove("hidden"); }
    if (view === "progress") { $("#progressView").classList.remove("hidden"); renderProgress(); }
    if (view === "parent")   { $("#parentView").classList.remove("hidden"); renderParentGate(); }
    if (view === "admin")    { $("#adminView").classList.remove("hidden"); renderAdminGate(); }
  }

  function hideAll() {
    ["loginView","setupView","sessionView","progressView","parentView","adminView"]
      .forEach((id) => $("#" + id).classList.add("hidden"));
  }

  // ---------------------------- Session flow --------------------------------
  function resetSessionUI() {
    $("#sessionStart").classList.remove("hidden");
    $("#sessionActive").classList.add("hidden");
    $("#sessionWrapup").classList.add("hidden");
    $("#questionWrap").classList.add("hidden");
    $("#feedbackBox").classList.add("hidden");
    $("#lessonBox").classList.add("hidden");
    state.session = null;
    state.sessionPlan = [];
    state.currentSkillIdx = 0;
    state.currentSkillId = null;
    state.introducedSkills = new Set();
    state.currentQuestion = null;
    state.hintLevel = 0;
    state.sessionStats = { asked: 0, correct: 0 };
    renderSessionStats();
  }

  async function startSession() {
    $("#startSessionBtn").disabled = true;
    $("#startSessionBtn").innerHTML = '<span class="spinner"></span> Planning your session...';

    // Load all skills (once per session) for the topic picker
    await loadAllSkills();

    // Create session row in DB
    const { data: sess, error: sErr } = await state.supa.from("j3prep_sessions").insert({
      student_id: state.me.id,
      subject: "math",
    }).select().single();
    if (sErr) { toast("Couldn't start session: " + sErr.message, true); resetSessionUI(); return; }
    state.session = sess;

    // Call edge function for greeting
    const greeting = await callTutor({ phase: "greeting", student_id: state.me.id, session_id: sess.id });
    if (greeting.error) { toast("Tutor error: " + greeting.error, true); resetSessionUI(); return; }

    state.sessionPlan = greeting.session_plan || [];
    state.currentSkillIdx = 0;

    // UI: show coach msg, hide start, populate picker
    $("#sessionStart").classList.add("hidden");
    $("#sessionActive").classList.remove("hidden");
    $("#coachMsg").textContent = greeting.message_to_student || "Let's go.";
    await populateTopicPicker();

    // Persist greeting on session
    await state.supa.from("j3prep_sessions").update({ greeting_md: greeting.message_to_student }).eq("id", sess.id);

    // Start with a lesson on the first skill, then questions
    const firstSkill = greeting.first_skill_id || state.sessionPlan[0];
    if (firstSkill) {
      await showLessonForSkill(firstSkill);
    } else {
      await nextQuestion();
    }
  }

  async function loadAllSkills() {
    if (state.allSkills.length) return;
    const { data, error } = await state.supa
      .from("j3prep_skills")
      .select("id, name, summary, strand, grade, difficulty")
      .eq("subject", "math")
      .order("grade").order("strand").order("id");
    if (error) { toast("Skills load failed: " + error.message, true); return; }
    state.allSkills = data || [];
  }

  async function populateTopicPicker() {
    const sel = $("#topicPicker");
    sel.innerHTML = "";

    // Pull mastery so we can annotate
    const { data: mastery } = await state.supa
      .from("j3prep_mastery").select("skill_id, score, status")
      .eq("student_id", state.me.id);
    const mMap = new Map((mastery || []).map((m) => [m.skill_id, m]));

    // Group by strand (within the student's grade ± 1 so cross-grade picking works too)
    const grade = state.me.grade_math ?? 5;
    const inRange = state.allSkills.filter((s) => Math.abs(s.grade - grade) <= 1);
    const byStrand = {};
    inRange.forEach((s) => { (byStrand[`Grade ${s.grade} — ${s.strand}`] ||= []).push(s); });

    Object.keys(byStrand).sort().forEach((strand) => {
      const og = document.createElement("optgroup");
      og.label = strand;
      byStrand[strand].forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        const m = mMap.get(s.id);
        const mark = m?.status === "mastered" ? " ✓"
                   : m?.score >= 0.5            ? ` (${Math.round(m.score*100)}%)`
                   : m                          ? " (learning)"
                                                : "";
        opt.textContent = s.name + mark;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });

    if (state.currentSkillId) sel.value = state.currentSkillId;
  }

  async function onTopicPicked(e) {
    const skillId = e.target.value;
    if (!skillId || skillId === state.currentSkillId) return;
    // Insert at the front of the plan and update index so nextQuestion will pick it next
    state.sessionPlan = [skillId, ...state.sessionPlan.filter((id) => id !== skillId)];
    state.currentSkillIdx = 0;
    await showLessonForSkill(skillId);
  }

  async function showLessonForSkill(skillId) {
    state.currentSkillId = skillId;
    $("#topicPicker").value = skillId;
    $("#questionWrap").classList.add("hidden");
    $("#feedbackBox").classList.add("hidden");

    const lessonBox = $("#lessonBox");
    const lessonMsg = $("#lessonMsg");
    lessonBox.classList.remove("hidden");
    lessonMsg.innerHTML = '<span class="spinner"></span> Coach J is preparing the lesson...';
    $("#startQuestionsBtn").disabled = true;

    const res = await callTutor({
      phase: "lesson_intro",
      student_id: state.me.id,
      session_id: state.session?.id,
      skill_id: skillId,
    });
    if (res.error) {
      toast("Lesson error: " + res.error, true);
      lessonBox.classList.add("hidden");
      return nextQuestion();
    }

    lessonMsg.textContent = res.message_to_student || res.lesson || "Let's get into it.";
    renderMath(lessonMsg);
    state.introducedSkills.add(skillId);
    $("#startQuestionsBtn").disabled = false;
    $("#startQuestionsBtn").focus();
  }

  async function startQuestionsFromLesson() {
    $("#lessonBox").classList.add("hidden");
    await nextQuestion();
  }

  async function nextQuestion() {
    if (state.sessionPlan.length === 0) { return endSession(); }
    const skillId = state.sessionPlan[state.currentSkillIdx % state.sessionPlan.length];

    // If we're transitioning to a NEW skill this session, show the lesson first.
    if (skillId !== state.currentSkillId && !state.introducedSkills.has(skillId)) {
      return showLessonForSkill(skillId);
    }
    state.currentSkillId = skillId;
    $("#topicPicker").value = skillId;

    $("#questionBox").innerHTML = '<span class="spinner"></span> Loading question...';
    $("#questionWrap").classList.remove("hidden");
    $("#feedbackBox").classList.add("hidden");
    $("#answerInput").value = "";
    $("#answerInput").disabled = false;
    $("#submitAnswerBtn").style.display = "";
    $("#skipBtn").style.display = "";
    $("#nextQBtn").style.display = "none";
    state.hintLevel = 0;

    const res = await callTutor({
      phase: "next_question",
      student_id: state.me.id,
      session_id: state.session?.id,
      skill_id: skillId,
    });
    if (res.error) { toast("Tutor error: " + res.error, true); return; }
    state.currentQuestion = res;
    $("#questionBox").textContent = res.question || "(no question)";
    $("#answerHint").textContent = res.answer_format_hint || "";
    if (res.intro_message) {
      $("#coachMsg").textContent = res.intro_message;
    }
    renderMath($("#questionBox"));
    $("#answerInput").focus();
  }

  // Phrases that mean "I don't get it — just explain and move on"
  const FORFEIT_RE = /^\s*(i\s*(don'?t|do not)\s*(understand|know|get(\s*it)?)|idk|no\s*idea|i'?m\s*lost|i'?m\s*stuck|help|explain|skip|pass|forfeit|forgo|i\s*give\s*up|\?+)\s*\.?\s*$/i;

  async function submitAnswer() {
    const ans = $("#answerInput").value.trim();
    if (!ans) return;
    if (!state.currentQuestion) return;

    // Treat "I don't understand" (and variants) as a forfeit, not a wrong answer.
    if (FORFEIT_RE.test(ans)) { return submitForfeit(ans); }

    $("#submitAnswerBtn").disabled = true;
    $("#submitAnswerBtn").innerHTML = '<span class="spinner"></span> Checking...';
    $("#answerInput").disabled = true;
    $("#skipBtn").disabled = true;

    const res = await callTutor({
      phase: "evaluate",
      student_id: state.me.id,
      session_id: state.session?.id,
      skill_id: state.currentQuestion.skill_id,
      question_text: state.currentQuestion.question,
      expected_answer: state.currentQuestion.expected_answer,
      given_answer: ans,
      hint_level: state.hintLevel,
    });

    $("#submitAnswerBtn").disabled = false;
    $("#submitAnswerBtn").textContent = "Submit";
    $("#skipBtn").disabled = false;

    if (res.error) { toast("Tutor error: " + res.error, true); $("#answerInput").disabled = false; return; }

    state.sessionStats.asked++;
    if (res.is_correct) state.sessionStats.correct++;

    const fb = $("#feedbackBox");
    fb.classList.remove("hidden", "correct", "incorrect");
    fb.classList.add("feedback", res.is_correct ? "correct" : "incorrect");
    fb.textContent = res.feedback || (res.is_correct ? "Correct." : "Not quite.");
    renderMath(fb);

    renderSessionStats();

    // Two-level flow: hint_level=0 → hint, hint_level=1 → full explanation w/ answer, move on
    if (res.is_correct || res.should_retry === false || state.hintLevel >= 1) {
      // Move on
      $("#submitAnswerBtn").style.display = "none";
      $("#skipBtn").style.display = "none";
      $("#nextQBtn").style.display = "";
      $("#nextQBtn").focus();
      // Advance skill rotation: if mastered enough, jump to next skill
      if (res.is_correct) state.currentSkillIdx++;
    } else {
      // Retry
      state.hintLevel++;
      $("#answerInput").disabled = false;
      $("#answerInput").value = "";
      $("#answerInput").focus();
    }
  }

  async function submitForfeit(rawAnswer) {
    if (!state.currentQuestion) return;
    const ans = (rawAnswer ?? $("#answerInput").value.trim()) || "(skipped)";

    $("#submitAnswerBtn").disabled = true;
    $("#skipBtn").disabled = true;
    $("#skipBtn").innerHTML = '<span class="spinner"></span> Explaining...';
    $("#answerInput").disabled = true;

    const res = await callTutor({
      phase: "evaluate",
      student_id: state.me.id,
      session_id: state.session?.id,
      skill_id: state.currentQuestion.skill_id,
      question_text: state.currentQuestion.question,
      expected_answer: state.currentQuestion.expected_answer,
      given_answer: ans,
      hint_level: state.hintLevel,
      forfeit: true,
    });

    $("#submitAnswerBtn").disabled = false;
    $("#skipBtn").disabled = false;
    $("#skipBtn").textContent = "Skip — Explain it";

    if (res.error) { toast("Tutor error: " + res.error, true); $("#answerInput").disabled = false; return; }

    const fb = $("#feedbackBox");
    fb.classList.remove("hidden", "correct", "incorrect");
    fb.classList.add("feedback", "incorrect");
    fb.textContent = res.feedback || "Here's the idea:";
    renderMath(fb);

    // No stats penalty for an honest "I don't get it" — just move on.
    $("#submitAnswerBtn").style.display = "none";
    $("#skipBtn").style.display = "none";
    $("#nextQBtn").style.display = "";
    $("#nextQBtn").focus();
    state.currentSkillIdx++;
  }

  async function endSession() {
    if (!state.session) { resetSessionUI(); return; }
    $("#endSessionBtn").disabled = true;
    $("#endSessionBtn").innerHTML = '<span class="spinner"></span> Wrapping up...';

    const wrap = await callTutor({
      phase: "wrap_up",
      student_id: state.me.id,
      session_id: state.session.id,
    });

    $("#sessionActive").classList.add("hidden");
    $("#sessionWrapup").classList.remove("hidden");
    $("#wrapupMsg").textContent = wrap.message_to_student || "Good session.";
    $("#endSessionBtn").disabled = false;
    $("#endSessionBtn").textContent = "End session";
  }

  function renderSessionStats() {
    const s = state.sessionStats;
    const pct = s.asked ? Math.round((s.correct / s.asked) * 100) : 0;
    $("#sessionStats").innerHTML = `
      <div class="stat">Questions: <b>${s.asked}</b></div>
      <div class="stat">Correct: <b>${s.correct}</b></div>
      <div class="stat">Accuracy: <b>${pct}%</b></div>
    `;
  }

  // ---------------------------- Tutor edge call -----------------------------
  async function callTutor(body) {
    try {
      const url = state.cfg.supabaseUrl + "/functions/v1/tutor-turn";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + state.cfg.supabaseAnon,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        return { error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      return await res.json();
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }

  // ---------------------------- Progress view -------------------------------
  async function renderProgress() {
    const root = $("#progressContent");
    root.innerHTML = '<p class="muted"><span class="spinner"></span> Loading...</p>';

    const [skillsResp, masteryResp] = await Promise.all([
      state.supa.from("j3prep_skills").select("*").eq("subject", "math").order("grade").order("strand").order("id"),
      state.supa.from("j3prep_mastery").select("*").eq("student_id", state.me.id),
    ]);
    if (skillsResp.error) { root.innerHTML = `<p class="bad">${skillsResp.error.message}</p>`; return; }

    const masteryMap = new Map((masteryResp.data || []).map((m) => [m.skill_id, m]));
    const skills = skillsResp.data || [];

    // Group by grade > strand
    const byGrade = {};
    skills.forEach((s) => {
      byGrade[s.grade] = byGrade[s.grade] || {};
      byGrade[s.grade][s.strand] = byGrade[s.grade][s.strand] || [];
      byGrade[s.grade][s.strand].push(s);
    });

    let html = "";
    Object.keys(byGrade).sort().forEach((grade) => {
      html += `<h3>Grade ${grade}</h3>`;
      Object.keys(byGrade[grade]).forEach((strand) => {
        const list = byGrade[grade][strand];
        html += `<div style="margin: 8px 0 16px;"><b>${strand}</b>`;
        html += `<div class="mastery-grid">`;
        list.forEach((s) => {
          const m = masteryMap.get(s.id);
          const score = m ? m.score : 0;
          const cell = score >= 0.85 ? 5 : score >= 0.7 ? 4 : score >= 0.5 ? 3 : score >= 0.3 ? 2 : score > 0 ? 1 : 0;
          html += `<div class="mastery-cell mc-${cell}" title="${s.name} — ${Math.round(score*100)}%"></div>`;
        });
        html += `</div></div>`;
      });
    });
    root.innerHTML = html || '<p class="muted">No skills loaded — make sure seed-skills.sql has been run.</p>';
  }

  // ---------------------------- Parent / Coach ------------------------------
  function renderParentGate() {
    if (state.parentUnlocked) { renderParent(); return; }
    $("#parentLocked").classList.remove("hidden");
    $("#parentUnlocked").classList.add("hidden");
    $("#parentPin").value = "";
    $("#parentPin").focus();
  }

  async function renderParent() {
    $("#parentLocked").classList.add("hidden");
    $("#parentUnlocked").classList.remove("hidden");
    const root = $("#parentContent");
    root.innerHTML = '<p class="muted"><span class="spinner"></span> Loading...</p>';

    const [studentsResp, masteryResp, sessionsResp] = await Promise.all([
      state.supa.from("j3prep_students").select("*").order("name"),
      state.supa.from("j3prep_mastery").select("*"),
      state.supa.from("j3prep_sessions").select("*").order("started_at", { ascending: false }).limit(50),
    ]);
    if (studentsResp.error) { root.innerHTML = `<p class="bad">${studentsResp.error.message}</p>`; return; }

    const masteryByStu = {};
    (masteryResp.data || []).forEach((m) => {
      (masteryByStu[m.student_id] = masteryByStu[m.student_id] || []).push(m);
    });
    const sessionsByStu = {};
    (sessionsResp.data || []).forEach((s) => {
      (sessionsByStu[s.student_id] = sessionsByStu[s.student_id] || []).push(s);
    });

    let html = "";
    (studentsResp.data || []).forEach((stu) => {
      const ms = masteryByStu[stu.id] || [];
      const mastered = ms.filter((m) => m.status === "mastered").length;
      const learning = ms.filter((m) => m.status === "learning").length;
      const ss = (sessionsByStu[stu.id] || []).slice(0, 3);
      html += `<div class="card" style="margin-bottom: 14px;">
        <h2>${escapeHtml(stu.name)} <span class="muted" style="font-weight:400; font-size:14px;">— Math Grade ${stu.grade_math}</span></h2>
        <div class="row" style="margin-bottom: 8px;">
          <div class="stat">Skills mastered: <b>${mastered}</b></div>
          <div class="stat">In progress: <b>${learning}</b></div>
          <div class="stat">Sessions: <b>${(sessionsByStu[stu.id] || []).length}</b></div>
        </div>
        ${ss.length ? `<h3>Recent sessions</h3>` : ""}
        ${ss.map((s) => `
          <div style="margin: 8px 0; padding: 10px; background: var(--panel-2); border-radius: 8px;">
            <div class="muted" style="font-size: 12px;">${fmtDate(s.started_at)}</div>
            <div>${s.questions_correct || 0}/${s.questions_asked || 0} correct &middot; ${(s.skills_touched || []).join(", ") || "—"}</div>
            ${s.summary_md ? `<div class="muted" style="margin-top: 6px; font-size: 14px;">${escapeHtml(s.summary_md)}</div>` : ""}
          </div>
        `).join("")}
      </div>`;
    });
    root.innerHTML = html || '<p class="muted">No students yet.</p>';
  }

  // ---------------------------- Admin ---------------------------------------
  function renderAdminGate() {
    if (state.adminUnlocked) { renderAdmin(); return; }
    $("#adminLocked").classList.remove("hidden");
    $("#adminUnlocked").classList.add("hidden");
    $("#adminPin").value = "";
    $("#adminPin").focus();
  }

  function unlockGate(which) {
    const pin = $("#" + which + "Pin").value.trim();
    if (pin !== state.cfg.adminPin) {
      const err = $("#" + which + "PinError");
      err.textContent = "Wrong PIN.";
      err.classList.remove("hidden");
      return;
    }
    if (which === "parent") { state.parentUnlocked = true; renderParent(); }
    else                    { state.adminUnlocked = true;  renderAdmin();  }
  }

  async function renderAdmin() {
    $("#adminLocked").classList.add("hidden");
    $("#adminUnlocked").classList.remove("hidden");
    const root = $("#rosterList");
    root.innerHTML = '<p class="muted"><span class="spinner"></span> Loading...</p>';
    const { data, error } = await state.supa.from("j3prep_students").select("*").order("name");
    if (error) { root.innerHTML = `<p class="bad">${error.message}</p>`; return; }
    if (!data || data.length === 0) { root.innerHTML = '<p class="muted">No students yet. Add one below.</p>'; return; }

    root.innerHTML = data.map((s) => `
      <div class="student-row">
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="meta">Math G${s.grade_math} &middot; PIN ${s.pin}</div>
        <div class="meta">${(s.interests || []).join(", ") || "no interests set"}</div>
        <button class="btn ghost" data-del="${s.id}">Delete</button>
      </div>
    `).join("");

    root.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("Delete this student? All their attempts and mastery will be removed.")) return;
        const { error } = await state.supa.from("j3prep_students").delete().eq("id", b.dataset.del);
        if (error) { toast(error.message, true); return; }
        toast("Deleted");
        renderAdmin();
        loadRosterIntoLogin();
      };
    });
  }

  async function addStudent() {
    const name = $("#newName").value.trim();
    const pin = $("#newPin").value.trim();
    const grade = parseInt($("#newGradeMath").value, 10) || 5;
    const interests = $("#newInterests").value.split(",").map((s) => s.trim()).filter(Boolean);
    const email = $("#newParentEmail").value.trim() || null;

    if (!name || !pin) { toast("Name and PIN required", true); return; }

    const { error } = await state.supa.from("j3prep_students").insert({
      name, pin, grade_math: grade, interests, parent_email: email,
    });
    if (error) { toast(error.message, true); return; }

    $("#newName").value = "";
    $("#newPin").value = "";
    $("#newInterests").value = "";
    $("#newParentEmail").value = "";
    toast("Student added");
    renderAdmin();
    loadRosterIntoLogin();
  }

  // ---------------------------- Helpers -------------------------------------
  function $(sel) { return document.querySelector(sel); }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  function renderMath(el) {
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$",  right: "$",  display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
        ],
        throwOnError: false,
      });
    } catch {}
  }

  let toastTimer = null;
  function toast(msg, bad) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("bad", !!bad);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }
})();
