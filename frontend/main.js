const inferredProxyPrefix = (() => {
  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0] || '';
  return firstSegment.startsWith('app') ? `/${firstSegment}` : '';
})();
const API_URL = (import.meta.env.VITE_API_URL || `${inferredProxyPrefix}/api` || '/api').replace(/\/$/, "");
const THEME_KEY = "ct_theme";
const AUTH_TOKEN_KEYS = ["ct_token", "ct_session_token"];
const AUTH_USER_KEYS = ["ct_user", "ct_session_user"];

const readStoredAuth = () => {
  const token = AUTH_TOKEN_KEYS.map((key) => localStorage.getItem(key) || sessionStorage.getItem(key)).find(Boolean) || "";
  let user = null;

  for (const key of AUTH_USER_KEYS) {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw) continue;
    try {
      user = JSON.parse(raw);
      break;
    } catch (error) {
      console.warn("Could not parse stored user data.", error);
    }
  }

  return { token, user };
};

const writeStoredAuth = (token, user) => {
  localStorage.setItem("ct_token", token);
  sessionStorage.setItem("ct_session_token", token);
  localStorage.setItem("ct_user", JSON.stringify(user));
  sessionStorage.setItem("ct_session_user", JSON.stringify(user));
};

const clearStoredAuth = () => {
  AUTH_TOKEN_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
  AUTH_USER_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

const state = {
  token: readStoredAuth().token,
  user: readStoredAuth().user,
  currentView: "dashboard",
  workoutFormVisible: false,
  dogWorkoutFormVisible: false,
  selectedDate: new Date().toISOString().slice(0, 10),
  workoutFilter: "all",
  theme: localStorage.getItem(THEME_KEY) || "light",
  allWorkouts: [],
  workouts: [],
  allJournals: [],
  dogWorkouts: [],
  journals: [],
  tasks: [],
  dogs: [],
  sportsSummary: null,
  sportsMarathons: [],
  raceReviews: [],
  registrationEnabled: true,
  registrationLockedOpen: false,
  adminAuditLogs: [],
  sportsTargetEvent: null,
  sportsConnectionStatus: null,
  adminUsers: [],
  adminExercises: [],
  adminDogExercises: [],
  exerciseOptions: [],
  dogExerciseOptions: [],
  journalFilter: "all",
  journalCategoryFilter: "all",
  editingJournalId: null,
  exercises: [
    {
      name: "",
      sets: "",
      reps: "",
      duration_minutes: "",
      bodyweight: true,
      notes: "",
    },
  ],
  dogExercises: [
    {
      name: "",
      reps: "",
      duration_minutes: "",
      rewarded: false,
      notes: "",
    },
  ],
};

const form = document.getElementById("workout-form");
const exerciseList = document.getElementById("exercise-list");
const workoutList = document.getElementById("workout-list");
const refreshButton = document.getElementById("refresh-button");
const refreshSportsButton = document.getElementById("refresh-sports-button");
const syncSportsLatestButton = document.getElementById("sync-sports-latest-button");
const syncSportsFullButton = document.getElementById("sync-sports-full-button");
const sportsAiAdviceButton = document.getElementById("sports-ai-advice-button");
const sportsTargetEventForm = document.getElementById("sports-target-event-form");
const sportsTargetEventClearButton = document.getElementById("sports-target-event-clear");
const refreshRaceReviewsButton = document.getElementById("refresh-race-reviews-button");
const raceReviewsList = document.getElementById("race-reviews-list");
const addExerciseButton = document.getElementById("add-exercise");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const registerStatus = document.getElementById("register-status");
const profileForm = document.getElementById("profile-form");
const userAdminForm = document.getElementById("user-admin-form");
const userAdminList = document.getElementById("user-admin-list");
const adminRegistrationEnabled = document.getElementById("admin-registration-enabled");
const adminRegistrationStatus = document.getElementById("admin-registration-status");
const adminAuditList = document.getElementById("admin-audit-list");
const exerciseAdminForm = document.getElementById("exercise-admin-form");
const adminList = document.getElementById("exercise-admin-list");
const dogWorkoutForm = document.getElementById("dog-workout-form");
const dogExerciseList = document.getElementById("dog-exercise-list");
const addDogExerciseButton = document.getElementById("add-dog-exercise");
const dogWorkoutList = document.getElementById("dog-workout-list");
const refreshDogButton = document.getElementById("refresh-dog-button");
const toggleDogWorkoutFormButton = document.getElementById("toggle-dog-workout-form");
const journalForm = document.getElementById("journal-form");
const journalList = document.getElementById("journal-list");
const refreshJournalButton = document.getElementById("refresh-journal-button");
const saveJournalButton = document.getElementById("save-journal-button");
const cancelJournalEditButton = document.getElementById("cancel-journal-edit");
const journalNewEntryButton = document.getElementById("journal-new-entry-button");
const journalTaskForm = document.getElementById("journal-task-form");
const journalModal = document.getElementById("journal-modal");
const journalTaskList = document.getElementById("journal-task-list");
const journalModalTitle = document.getElementById("journal-modal-title");
const journalModalForm = document.getElementById("journal-modal-form");
const journalModalTitleInput = document.getElementById("journal-modal-title-input");
const journalModalDescription = document.getElementById("journal-modal-description");
const journalModalCloseButton = document.getElementById("journal-modal-close");
const journalModalCancelButton = document.getElementById("journal-modal-cancel");
const journalModalSaveButton = document.getElementById("journal-modal-save");
const journalModalDeleteButton = document.getElementById("journal-modal-delete");
const editModal = document.getElementById("edit-modal");
const editModalTitle = document.getElementById("edit-modal-title");
const editModalForm = document.getElementById("edit-modal-form");
const editModalFields = document.getElementById("edit-modal-fields");
const editModalError = document.getElementById("edit-modal-error");
const editModalSaveButton = document.getElementById("edit-modal-save");
const editModalCancelButton = document.getElementById("edit-modal-cancel");
const editModalCloseButton = document.getElementById("edit-modal-close");
const journalOpenCard = document.getElementById("journal-open-card");
const moduleStatusList = document.getElementById("module-status-list");
const dashboardSummary = document.getElementById("dashboard-summary");
const taskForm = document.getElementById("task-form");
const toggleDashboardTaskFormButton = document.getElementById("toggle-dashboard-task-form");
const dogForm = document.getElementById("dog-form");
const dogList = document.getElementById("dog-list");
const dogSelect = document.getElementById("dog-select");
const dogExerciseAdminForm = document.getElementById("dog-exercise-admin-form");
const dogExerciseAdminList = document.getElementById("dog-exercise-admin-list");
const mfaStatus = document.getElementById("mfa-status");
const setupMfaButton = document.getElementById("setup-mfa-button");
const disableMfaButton = document.getElementById("disable-mfa-button");
const verifyMfaButton = document.getElementById("verify-mfa-button");
const confirmDisableMfaButton = document.getElementById("confirm-disable-mfa-button");
const mfaCode = document.getElementById("mfa-code");
const sportsMarathonsContainer = document.getElementById("sports-marathons");
const sportsAnalysisPanels = document.getElementById("sports-analysis-panels");
const mfaDisableCode = document.getElementById("mfa-disable-code");
const mfaSetupPanel = document.getElementById("mfa-setup-panel");
const mfaDisablePanel = document.getElementById("mfa-disable-panel");
const mfaQr = document.getElementById("mfa-qr");
const profileSportsConnectionStatus = document.getElementById("profile-sports-connection-status");
const sidebar = document.getElementById("sidebar");
const appShell = document.querySelector(".app-shell");
const themeToggle = document.getElementById("theme-toggle");
const toggleWorkoutFormButton = document.getElementById("toggle-workout-form");

const editModalState = {
  title: "",
  submitLabel: "Save changes",
  fields: [],
  onSubmit: null,
  busy: false,
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const scoreBandFromValue = (value) => {
  const num = Number(value) || 0;
  if (num >= 75) return "strong";
  if (num >= 60) return "developing";
  return "weak";
};

const scoreBandLabel = (band) => (band === "strong" ? "Strong" : band === "developing" ? "Developing" : "Weak");

const buildLinePath = (values, width, height) => {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (((value - min) / span) * height);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

const getFieldGroupClass = (field) => (field.fullWidth ? "form-row single" : "form-row");

const isIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const renderEditFieldControl = (field) => {
  const fieldId = `edit-field-${field.name}`;
  const helpText = field.help ? `<span class="field-help">${escapeHtml(field.help)}</span>` : "";

  const minLengthAttr = field.minLength !== undefined ? `minlength="${escapeHtml(field.minLength)}"` : "";
  const maxLengthAttr = field.maxLength !== undefined ? `maxlength="${escapeHtml(field.maxLength)}"` : "";
  const patternAttr = field.pattern ? `pattern="${escapeHtml(field.pattern)}"` : "";

  if (field.type === "textarea") {
    return `
      <label>
        ${escapeHtml(field.label)}
        <textarea id="${fieldId}" name="${escapeHtml(field.name)}" ${field.required ? "required" : ""} placeholder="${escapeHtml(field.placeholder || "")}" ${minLengthAttr} ${maxLengthAttr}>${escapeHtml(field.value || "")}</textarea>
        ${helpText}
      </label>
    `;
  }

  if (field.type === "select") {
    const options = (field.options || [])
      .map((option) => {
        const selected = String(option.value) === String(field.value ?? "") ? "selected" : "";
        return `<option value="${escapeHtml(option.value)}" ${selected}>${escapeHtml(option.label)}</option>`;
      })
      .join("");

    return `
      <label>
        ${escapeHtml(field.label)}
        <select id="${fieldId}" name="${escapeHtml(field.name)}" ${field.required ? "required" : ""}>
          ${options}
        </select>
        ${helpText}
      </label>
    `;
  }

  if (field.type === "checkbox") {
    return `
      <label class="checkbox-wrap inline">
        <input id="${fieldId}" name="${escapeHtml(field.name)}" type="checkbox" ${field.value ? "checked" : ""} />
        ${escapeHtml(field.label)}
      </label>
      ${helpText}
    `;
  }

  const inputType = field.type || "text";
  const minAttr = field.min !== undefined ? `min="${escapeHtml(field.min)}"` : "";
  const maxAttr = field.max !== undefined ? `max="${escapeHtml(field.max)}"` : "";
  const stepAttr = field.step !== undefined ? `step="${escapeHtml(field.step)}"` : "";

  return `
    <label>
      ${escapeHtml(field.label)}
      <input
        id="${fieldId}"
        name="${escapeHtml(field.name)}"
        type="${escapeHtml(inputType)}"
        value="${escapeHtml(field.value || "")}"
        placeholder="${escapeHtml(field.placeholder || "")}"
        ${field.required ? "required" : ""}
        ${minLengthAttr}
        ${maxLengthAttr}
        ${patternAttr}
        ${minAttr}
        ${maxAttr}
        ${stepAttr}
      />
      ${helpText}
    </label>
  `;
};

const renderEditModalFields = () => {
  if (!editModalFields) return;

  const rows = [];
  let buffer = [];

  const flushBuffer = () => {
    if (!buffer.length) return;
    rows.push(`<div class="form-row">${buffer.join("")}</div>`);
    buffer = [];
  };

  editModalState.fields.forEach((field) => {
    const control = renderEditFieldControl(field);
    if (field.type === "checkbox" || field.fullWidth) {
      flushBuffer();
      rows.push(`<div class="${getFieldGroupClass(field)}">${control}</div>`);
      return;
    }

    buffer.push(control);
    if (buffer.length === 2) {
      flushBuffer();
    }
  });

  flushBuffer();
  editModalFields.innerHTML = rows.join("");
};

const setEditModalError = (message = "") => {
  if (!editModalError) return;
  if (!message) {
    editModalError.textContent = "";
    editModalError.classList.add("hidden");
    return;
  }
  editModalError.textContent = message;
  editModalError.classList.remove("hidden");
};

const setEditModalBusy = (busy) => {
  editModalState.busy = busy;
  if (!editModalSaveButton) return;
  editModalSaveButton.disabled = busy;
};

const openEditModal = ({ title, submitLabel = "Save changes", fields = [], onSubmit }) => {
  if (!editModal || !editModalForm) return;
  editModalState.title = title;
  editModalState.submitLabel = submitLabel;
  editModalState.fields = fields;
  editModalState.onSubmit = onSubmit;
  setEditModalError("");
  setEditModalBusy(false);

  if (editModalTitle) editModalTitle.textContent = title;
  if (editModalSaveButton) editModalSaveButton.textContent = submitLabel;
  renderEditModalFields();

  editModal.classList.remove("hidden");
  editModal.setAttribute("aria-hidden", "false");
  const firstInput = editModalForm.querySelector("input, select, textarea");
  if (firstInput) requestAnimationFrame(() => firstInput.focus());
};

const closeEditModal = () => {
  if (!editModal) return;
  editModal.classList.add("hidden");
  editModal.setAttribute("aria-hidden", "true");
  editModalState.title = "";
  editModalState.submitLabel = "Save changes";
  editModalState.fields = [];
  editModalState.onSubmit = null;
  setEditModalError("");
  setEditModalBusy(false);
  if (editModalFields) editModalFields.innerHTML = "";
};

const collectEditModalValues = () => {
  if (!editModalForm) return {};

  const values = {};
  for (const field of editModalState.fields) {
    const input = editModalForm.elements.namedItem(field.name);
    if (!(input instanceof HTMLElement)) continue;

    if (input instanceof HTMLInputElement && input.type === "checkbox") {
      values[field.name] = input.checked;
    } else if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) {
      values[field.name] = input.value;
    }
  }

  return values;
};

const validateEditValues = (values) => {
  for (const field of editModalState.fields) {
    const value = values[field.name];
    if (field.required && typeof value === "string" && !value.trim()) {
      return `${field.label} is required.`;
    }
    if (typeof field.validate === "function") {
      const validationError = field.validate(value, values);
      if (validationError) return validationError;
    }
  }
  return "";
};

const handleEditModalSubmit = async (event) => {
  event.preventDefault();
  if (editModalState.busy || typeof editModalState.onSubmit !== "function") return;

  if (editModalForm && !editModalForm.checkValidity()) {
    editModalForm.reportValidity();
    return;
  }

  const values = collectEditModalValues();
  const validationError = validateEditValues(values);
  if (validationError) {
    setEditModalError(validationError);
    return;
  }

  try {
    setEditModalBusy(true);
    setEditModalError("");
    await editModalState.onSubmit(values);
    closeEditModal();
  } catch (error) {
    setEditModalError(error?.message || "Could not save your changes.");
  } finally {
    setEditModalBusy(false);
  }
};

const setTheme = (theme) => {
  const normalized = theme === "dark" ? "dark" : "light";
  state.theme = normalized;
  document.documentElement.setAttribute("data-theme", normalized);
  localStorage.setItem(THEME_KEY, normalized);

  if (themeToggle) {
    const next = normalized === "dark" ? "light" : "dark";
    const icon = normalized === "dark" ? "☀" : "☾";
    themeToggle.textContent = icon;
    themeToggle.setAttribute("aria-label", `Switch to ${next} theme`);
    themeToggle.title = `Switch to ${next} theme`;
  }
};

const toggleTheme = () => {
  setTheme(state.theme === "dark" ? "light" : "dark");
};

const apiFetch = async (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (state.token && !options.skipAuth) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;
  const rawText = payload ? "" : await response.text().catch(() => "");

  if (!response.ok) {
    let message = payload?.message || "";
    if (!message && response.status === 413) {
      message = "Upload file is too large. Please use a smaller FIT/TCX/GPX file.";
    } else if (!message && rawText && /entity too large|payload too large|request entity too large/i.test(rawText)) {
      message = "Upload file is too large. Please use a smaller FIT/TCX/GPX file.";
    }
    const error = new Error(message || "Request failed");
    error.status = response.status;
    throw error;
  }

  return payload;
};

const setDateValue = () => {
  document.getElementById("workout-date").value = state.selectedDate;
  const dogDateInput = document.getElementById("dog-workout-date");
  if (dogDateInput) dogDateInput.value = state.selectedDate;
};

const setWorkoutFormVisible = (visible) => {
  state.workoutFormVisible = Boolean(visible);
  if (form) {
    form.classList.toggle("hidden", !state.workoutFormVisible);
  }
  if (toggleWorkoutFormButton) {
    toggleWorkoutFormButton.textContent = state.workoutFormVisible ? "Hide add workout form" : "Show add workout form";
    toggleWorkoutFormButton.setAttribute("aria-expanded", state.workoutFormVisible ? "true" : "false");
  }
};

const setDogWorkoutFormVisible = (visible) => {
  state.dogWorkoutFormVisible = Boolean(visible);
  if (dogWorkoutForm) {
    dogWorkoutForm.classList.toggle("hidden", !state.dogWorkoutFormVisible);
  }
  if (toggleDogWorkoutFormButton) {
    toggleDogWorkoutFormButton.textContent = state.dogWorkoutFormVisible ? "Hide add session form" : "Show add session form";
    toggleDogWorkoutFormButton.setAttribute("aria-expanded", state.dogWorkoutFormVisible ? "true" : "false");
  }
};

const persistAuth = (token, user) => {
  const incomingStatus = user?.sports_connection_status || null;
  const normalizedUser = incomingStatus ? { ...user } : user;
  if (incomingStatus && normalizedUser) {
    delete normalizedUser.sports_connection_status;
  }
  state.token = token;
  state.user = normalizedUser;
  state.sportsConnectionStatus = incomingStatus;
  writeStoredAuth(token, normalizedUser);
  renderView();
};

const clearAuth = () => {
  state.token = "";
  state.user = null;
  state.sportsConnectionStatus = null;
  state.adminAuditLogs = [];
  clearStoredAuth();
  renderAdminAuditLogs();
  renderView();
};

const loadProfile = async ({ silentInvalidSession = false } = {}) => {
  if (!state.token) return null;

  try {
    const profile = await apiFetch(`${API_URL}/profile`);
    state.sportsConnectionStatus = profile?.sports_connection_status || null;
    const normalizedProfile = { ...profile };
    delete normalizedProfile.sports_connection_status;
    state.user = normalizedProfile;
    writeStoredAuth(state.token, normalizedProfile);
    renderView();
    return normalizedProfile;
  } catch (error) {
    if (error.status === 401 || error.status === 404) {
      if (!silentInvalidSession) {
        clearAuth();
        alert("Your session is no longer valid. Please sign in again.");
      }
      return null;
    }
    console.error(error);
    return null;
  }
};

const formatDateTime = (value) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const renderSportsConnectionStatus = () => {
  if (!profileSportsConnectionStatus) return;
  if (!state.user?.sports_enabled) {
    profileSportsConnectionStatus.innerHTML = "<p class='meta'>Sports module is disabled for this profile.</p>";
    return;
  }

  const status = state.sportsConnectionStatus || {};
  const lastRun = status.last_run || null;
  const sessionLabel = status.has_cached_session ? "Cached session available" : "No cached session";
  const authLabel = status.last_authenticated_at ? formatDateTime(status.last_authenticated_at) : "Not authenticated yet";
  const syncLabel = status.last_sync_at ? formatDateTime(status.last_sync_at) : "Never synced";
  const syncOutcome = lastRun?.status ? String(lastRun.status).toUpperCase() : "N/A";
  const syncDetails = lastRun
    ? `${lastRun.mode || "unknown"} · fetched ${Number(lastRun.fetched || 0)} · inserted ${Number(lastRun.inserted || 0)} · updated ${Number(lastRun.updated || 0)}`
    : "No sync run recorded yet.";
  const errorText = status.last_sync_error || lastRun?.error_message || "";

  profileSportsConnectionStatus.innerHTML = `
    <div class="dashboard-summary-grid">
      <div class="dashboard-summary-card">
        <div class="summary-topline"><span>Session cache</span><strong>${sessionLabel}</strong></div>
        <small>Last auth: ${authLabel}</small>
      </div>
      <div class="dashboard-summary-card">
        <div class="summary-topline"><span>Last sync</span><strong>${syncOutcome}</strong></div>
        <small>${syncLabel}</small>
      </div>
      <div class="dashboard-summary-card">
        <div class="summary-topline"><span>Stored data</span><strong>${Number(status.storage?.activities_count || 0)} activities</strong></div>
        <small>${Number(status.storage?.custom_workouts_count || 0)} custom workouts</small>
      </div>
    </div>
    <p class="meta">${syncDetails}</p>
    ${errorText ? `<p class="meta" style="color:#b00020;">Last error: ${errorText}</p>` : ""}
  `;
};

const renderView = () => {
  const isLoggedIn = Boolean(state.token);
  if (sidebar) sidebar.hidden = !isLoggedIn;
  const topbar = document.getElementById("topbar");
  if (topbar) topbar.hidden = !isLoggedIn;
  if (appShell) appShell.classList.toggle("auth-only", !isLoggedIn);

  const workoutNavButton = document.querySelector('.nav-button[data-view="workouts"]');
  if (workoutNavButton) {
    workoutNavButton.hidden = !isLoggedIn || !Boolean(state.user?.workouts_enabled);
  }
  const dogNavButton = document.querySelector('.nav-button[data-view="dog"]');
  if (dogNavButton) {
    dogNavButton.hidden = !isLoggedIn || !Boolean(state.user?.dog_training_enabled);
  }
  const journalNavButton = document.querySelector('.nav-button[data-view="journal"]');
  if (journalNavButton) {
    journalNavButton.hidden = !isLoggedIn || !Boolean(state.user?.journal_enabled);
  }
  const sportsNavButton = document.querySelector('.nav-button[data-view="sports"]');
  if (sportsNavButton) {
    sportsNavButton.hidden = !isLoggedIn || !Boolean(state.user?.sports_enabled);
  }
  const raceReviewsNavButton = document.querySelector('.nav-button[data-view="race-reviews"]');
  if (raceReviewsNavButton) {
    raceReviewsNavButton.hidden = !isLoggedIn || !Boolean(state.user?.sports_enabled);
  }
  const adminNavButton = document.querySelector('.nav-button[data-view="admin"]');
  if (adminNavButton) {
    adminNavButton.hidden = !isLoggedIn || !Boolean(state.user?.is_admin);
  }

  const authView = document.getElementById("auth-view");
  if (authView) {
    authView.hidden = isLoggedIn;
    authView.classList.toggle("hidden", isLoggedIn);
  }

  if (state.currentView === "workouts" && (!isLoggedIn || !state.user?.workouts_enabled)) {
    state.currentView = "dashboard";
  }
  if (state.currentView === "dog" && (!isLoggedIn || !state.user?.dog_training_enabled)) {
    state.currentView = "dashboard";
  }
  if (state.currentView === "journal" && (!isLoggedIn || !state.user?.journal_enabled)) {
    state.currentView = "dashboard";
  }
  if (state.currentView === "sports" && (!isLoggedIn || !state.user?.sports_enabled)) {
    state.currentView = "dashboard";
  }
  if (state.currentView === "race-reviews" && (!isLoggedIn || !state.user?.sports_enabled)) {
    state.currentView = "dashboard";
  }
  if (state.currentView === "admin" && (!isLoggedIn || !state.user?.is_admin)) {
    state.currentView = "dashboard";
  }

  ["dashboard", "workouts", "dog", "journal", "sports", "race-reviews", "admin", "profile"].forEach((viewName) => {
    const el = document.getElementById(`${viewName}-view`);
    if (el) {
      const moduleLocked =
        (viewName === "workouts" && !Boolean(state.user?.workouts_enabled)) ||
        (viewName === "dog" && !Boolean(state.user?.dog_training_enabled)) ||
        (viewName === "journal" && !Boolean(state.user?.journal_enabled)) ||
        ((viewName === "sports" || viewName === "race-reviews") && !Boolean(state.user?.sports_enabled)) ||
        (viewName === "admin" && !Boolean(state.user?.is_admin));
      const shouldHide = !isLoggedIn || moduleLocked || state.currentView !== viewName;
      el.classList.toggle("hidden", shouldHide);
    }
  });

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.currentView);
  });

  if (isLoggedIn && state.user) {
    const firstName = document.getElementById("profile-first-name");
    const lastName = document.getElementById("profile-last-name");
    const email = document.getElementById("profile-email");
    const goal = document.getElementById("profile-goal");
    const workoutsEnabled = document.getElementById("profile-workouts-enabled");
    const dogEnabled = document.getElementById("profile-dog-enabled");
    const journalEnabled = document.getElementById("profile-journal-enabled");
    const sportsEnabled = document.getElementById("profile-sports-enabled");
    const garminEmail = document.getElementById("profile-garmin-email");
    const garminPassword = document.getElementById("profile-garmin-password");
    const clearGarminPassword = document.getElementById("profile-clear-garmin-password");
    const roleLabel = document.getElementById("profile-role-label");
    if (firstName) firstName.value = state.user.first_name || "";
    if (lastName) lastName.value = state.user.last_name || "";
    if (email) email.value = state.user.email || "";
    if (goal) goal.value = state.user.goal || "";
    if (workoutsEnabled) workoutsEnabled.checked = state.user.workouts_enabled !== false;
    if (dogEnabled) dogEnabled.checked = Boolean(state.user.dog_training_enabled);
    if (journalEnabled) journalEnabled.checked = Boolean(state.user.journal_enabled);
    if (sportsEnabled) sportsEnabled.checked = Boolean(state.user.sports_enabled);
    if (garminEmail) garminEmail.value = state.user.garmin_email || "";
    if (garminPassword) garminPassword.value = "";
    if (clearGarminPassword) clearGarminPassword.checked = false;
    if (roleLabel) roleLabel.textContent = state.user.is_admin ? "Role: administrator" : "Role: standard user";
  }

  const mfaEnabled = Boolean(state.user?.mfa_enabled);
  if (mfaStatus) {
    mfaStatus.textContent = mfaEnabled ? "MFA is enabled for this account." : "MFA is disabled.";
  }
  if (setupMfaButton) {
    setupMfaButton.disabled = mfaEnabled;
  }
  if (disableMfaButton) {
    disableMfaButton.disabled = !mfaEnabled;
  }
  if (mfaSetupPanel) {
    mfaSetupPanel.classList.toggle("hidden", !mfaSetupPanel.dataset.visible || !mfaEnabled || !mfaSetupPanel.dataset.visible);
  }
  if (mfaDisablePanel) {
    mfaDisablePanel.classList.toggle("hidden", !mfaDisablePanel.dataset.visible || mfaEnabled);
  }
  renderSportsTargetEventForm();
  renderSportsConnectionStatus();
};

const updateMfaStatus = () => {
  if (!state.user) {
    if (mfaStatus) mfaStatus.textContent = "MFA is disabled.";
    if (mfaSetupPanel) mfaSetupPanel.classList.add("hidden");
    if (mfaDisablePanel) mfaDisablePanel.classList.add("hidden");
    if (mfaQr) mfaQr.innerHTML = "";
    if (mfaCode) mfaCode.value = "";
    if (mfaDisableCode) mfaDisableCode.value = "";
    return;
  }

  const enabled = Boolean(state.user.mfa_enabled);
  if (mfaStatus) {
    mfaStatus.textContent = enabled ? "MFA is enabled for this account." : "MFA is disabled.";
  }
  if (setupMfaButton) {
    setupMfaButton.disabled = enabled;
  }
  if (disableMfaButton) {
    disableMfaButton.disabled = !enabled;
  }
  if (mfaSetupPanel) {
    mfaSetupPanel.classList.add("hidden");
    mfaSetupPanel.dataset.visible = "false";
  }
  if (mfaDisablePanel) {
    mfaDisablePanel.classList.add("hidden");
    mfaDisablePanel.dataset.visible = "false";
  }
  if (mfaQr) mfaQr.innerHTML = "";
  if (mfaCode) mfaCode.value = "";
  if (mfaDisableCode) mfaDisableCode.value = "";
};

const handleMfaSetup = async () => {
  try {
    const response = await apiFetch(`${API_URL}/auth/mfa/setup`, { method: "POST" });
    const qrUri = response.qrCode || response.otpauth || "";
    if (!qrUri) {
      throw new Error("MFA setup response did not include a QR code.");
    }
    if (mfaQr) {
      const encoded = encodeURIComponent(qrUri);
      mfaQr.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encoded}" alt="MFA QR code" />`;
    }
    if (mfaSetupPanel) {
      mfaSetupPanel.dataset.visible = "true";
      mfaSetupPanel.classList.remove("hidden");
    }
    if (mfaDisablePanel) {
      mfaDisablePanel.classList.add("hidden");
    }
  } catch (error) {
    alert(error.message || "Could not set up MFA.");
  }
};

const handleMfaVerify = async () => {
  const otp = String(mfaCode?.value || "").trim();
  if (!otp) {
    alert("Enter the 6-digit MFA code from your authenticator app.");
    return;
  }

  try {
    const response = await apiFetch(`${API_URL}/auth/mfa/verify`, {
      method: "POST",
      body: JSON.stringify({ otp }),
    });
    state.user = response.user;
    localStorage.setItem("ct_user", JSON.stringify(response.user));
    updateMfaStatus();
    if (mfaSetupPanel) mfaSetupPanel.classList.add("hidden");
    alert("MFA enabled successfully.");
  } catch (error) {
    alert(error.message || "Unable to verify MFA code.");
  }
};

const handleMfaDisable = async () => {
  const otp = String(mfaDisableCode?.value || "").trim();
  if (!otp) {
    alert("Enter the current MFA code before disabling it.");
    return;
  }

  try {
    const response = await apiFetch(`${API_URL}/auth/mfa/disable`, {
      method: "POST",
      body: JSON.stringify({ otp }),
    });
    state.user = response.user;
    localStorage.setItem("ct_user", JSON.stringify(response.user));
    updateMfaStatus();
    if (mfaDisablePanel) mfaDisablePanel.classList.add("hidden");
    alert("MFA disabled.");
  } catch (error) {
    alert(error.message || "Unable to disable MFA.");
  }
};

const renderExerciseRows = () => {
  exerciseList.innerHTML = state.exercises
    .map(
      (exercise, index) => {
        const options = state.exerciseOptions.length
          ? state.exerciseOptions
              .map(
                (option) =>
                  `<option value="${option.name}" ${option.name === exercise.name ? "selected" : ""}>${option.name}</option>`,
              )
              .join("")
          : "<option value=''>No exercises loaded</option>";

        return `
        <div class="exercise-row">
          <select data-index="${index}" data-field="name">
            <option value="">Select an exercise</option>
            ${options}
          </select>
          <input
            type="number"
            min="0"
            placeholder="Sets"
            data-index="${index}"
            data-field="sets"
            value="${exercise.sets}"
          />
          <input
            type="number"
            min="0"
            placeholder="Reps"
            data-index="${index}"
            data-field="reps"
            value="${exercise.reps}"
          />
          <input
            type="number"
            min="0"
            placeholder="Min"
            data-index="${index}"
            data-field="duration_minutes"
            value="${exercise.duration_minutes}"
          />
          <label class="checkbox-wrap">
            <input
              type="checkbox"
              data-index="${index}"
              data-field="bodyweight"
              ${exercise.bodyweight ? "checked" : ""}
            />
            Bodyweight
          </label>
          <button type="button" class="remove-btn" data-index="${index}">Remove</button>
        </div>
      `;
      },
    )
    .join("");
};

const addExerciseRow = () => {
  state.exercises.push({ name: "", sets: "", reps: "", duration_minutes: "", bodyweight: true, notes: "" });
  renderExerciseRows();
};

const loadExerciseOptions = async () => {
  if (!state.token) return;

  try {
    const exercises = await apiFetch(`${API_URL}/exercises`);
    state.exerciseOptions = exercises;

    if (!state.exercises[0]?.name && exercises.length) {
      state.exercises[0].name = exercises[0].name;
    }

    renderExerciseRows();
  } catch (error) {
    console.error(error);
  }
};

const renderUserAdminList = (users = []) => {
  if (!userAdminList) return;
  if (!users.length) {
    userAdminList.innerHTML = "<p class='meta'>No users yet.</p>";
    return;
  }

  userAdminList.innerHTML = users
    .map(
      (user) => `
        <div class="exercise-admin-item">
          <div class="workout-item-header">
            <div>
              <strong>${user.username}</strong>
              <p class="meta">${[user.first_name, user.last_name].filter(Boolean).join(" ") || "No name provided"}${user.email ? ` · ${user.email}` : ""}</p>
            </div>
            <div class="list-inline-actions">
              <span class="meta">${user.is_admin ? "Admin" : "User"}</span>
              <button class="ghost small" type="button" data-edit-user-id="${user.id}">Edit</button>
              <button class="ghost small" type="button" data-delete-user-id="${user.id}" ${state.user?.id === user.id ? "disabled" : ""}>Delete</button>
            </div>
          </div>
          <div class="checkbox-row">
            <label class="checkbox-wrap inline">
              <input type="checkbox" data-user-id="${user.id}" data-user-field="workouts_enabled" ${user.workouts_enabled !== false ? "checked" : ""} />
              Calisthenics
            </label>
            <label class="checkbox-wrap inline">
              <input type="checkbox" data-user-id="${user.id}" data-user-field="dog_training_enabled" ${user.dog_training_enabled ? "checked" : ""} />
              Dog training
            </label>
            <label class="checkbox-wrap inline">
              <input type="checkbox" data-user-id="${user.id}" data-user-field="journal_enabled" ${user.journal_enabled ? "checked" : ""} />
              Journal
            </label>
            <label class="checkbox-wrap inline">
              <input type="checkbox" data-user-id="${user.id}" data-user-field="sports_enabled" ${user.sports_enabled ? "checked" : ""} />
              Sports
            </label>
            <label class="checkbox-wrap inline">
              <input type="checkbox" data-user-id="${user.id}" data-user-field="is_admin" ${user.is_admin ? "checked" : ""} />
              Administrator
            </label>
          </div>
        </div>
      `,
    )
    .join("");
};

const loadUsers = async () => {
  if (!state.token || !state.user?.is_admin) return;

  try {
    const users = await apiFetch(`${API_URL}/users`);
    state.adminUsers = users;
    renderUserAdminList(users);
  } catch (error) {
    state.adminUsers = [];
    if (userAdminList) userAdminList.innerHTML = "<p class='meta'>Unable to load users right now.</p>";
    console.error(error);
  }
};

const renderAdminAuditLogs = () => {
  if (!adminAuditList) return;
  const logs = Array.isArray(state.adminAuditLogs) ? state.adminAuditLogs : [];
  if (!logs.length) {
    adminAuditList.innerHTML = "<p class='meta'>No admin audit entries yet.</p>";
    return;
  }
  adminAuditList.innerHTML = `
    <div class="list-header compact">
      <h3>Admin audit log</h3>
    </div>
    ${logs
      .map((entry) => {
        const details = entry?.details && typeof entry.details === "object"
          ? Object.entries(entry.details).map(([key, value]) => `${key}: ${value}`).join(" · ")
          : "";
        return `
          <div class="exercise-admin-item">
            <div class="workout-item-header">
              <div>
                <strong>${escapeHtml(entry.action || "unknown-action")}</strong>
                <p class="meta">${escapeHtml(entry.actor_username || "unknown")} ${entry.target_username ? `→ ${escapeHtml(entry.target_username)}` : ""} · ${formatDateTime(entry.created_at)}</p>
                ${details ? `<p class="meta">${escapeHtml(details)}</p>` : ""}
              </div>
            </div>
          </div>
        `;
      })
      .join("")}
  `;
};

const loadAdminAuditLogs = async () => {
  if (!state.token || !state.user?.is_admin) return;
  try {
    const logs = await apiFetch(`${API_URL}/admin/audit-logs`);
    state.adminAuditLogs = Array.isArray(logs) ? logs : [];
  } catch (error) {
    console.error(error);
    state.adminAuditLogs = [];
  }
  renderAdminAuditLogs();
};

const renderRegistrationControls = () => {
  if (registerForm instanceof HTMLFormElement) {
    const disabled = !state.registrationEnabled;
    Array.from(registerForm.elements).forEach((element) => {
      if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        element.disabled = disabled;
      }
    });
    registerForm.classList.toggle("disabled", disabled);
  }
  if (registerStatus) {
    if (state.registrationEnabled) {
      registerStatus.textContent = "Create your account if registration is open.";
    } else {
      registerStatus.textContent = "Registration is currently closed. Please contact an administrator.";
    }
  }
  if (adminRegistrationEnabled instanceof HTMLInputElement) {
    const lockedOpen = Boolean(state.registrationLockedOpen);
    adminRegistrationEnabled.checked = Boolean(state.registrationEnabled);
    adminRegistrationEnabled.disabled = lockedOpen;
  }
  if (adminRegistrationStatus) {
    if (state.registrationLockedOpen) {
      adminRegistrationStatus.textContent = "Registration remains enabled until at least one account exists.";
    } else {
      adminRegistrationStatus.textContent = state.registrationEnabled
        ? "Self-registration is currently enabled."
        : "Self-registration is currently disabled.";
    }
  }
};

const loadRegistrationBootstrap = async () => {
  try {
    const bootstrap = await apiFetch(`${API_URL}/auth/bootstrap`, { skipAuth: true });
    state.registrationEnabled = bootstrap?.registration_enabled !== false;
    state.registrationLockedOpen = !Boolean(bootstrap?.hasUsers);
  } catch (error) {
    console.error(error);
    state.registrationEnabled = true;
    state.registrationLockedOpen = false;
  }
  renderRegistrationControls();
};

const loadAdminRegistrationSetting = async () => {
  if (!state.token || !state.user?.is_admin) return;
  try {
    const payload = await apiFetch(`${API_URL}/admin/settings/registration`);
    state.registrationEnabled = payload?.registration_enabled !== false;
    state.registrationLockedOpen = Boolean(payload?.locked_open);
  } catch (error) {
    console.error(error);
  }
  renderRegistrationControls();
  await loadAdminAuditLogs();
};

const loadSportsSummary = async () => {
  if (!state.token) {
    state.sportsSummary = null;
    state.raceReviews = [];
    renderSportsSummary();
    renderRaceReviews();
    return;
  }

  if (!state.user?.sports_enabled) {
    state.sportsSummary = null;
    state.raceReviews = [];
    renderSportsSummary();
    renderRaceReviews();
    return;
  }

  try {
    const payload = await apiFetch(`${API_URL}/sports/summary`);
    state.sportsSummary = payload;
    state.sportsTargetEvent = payload?.selected_target_event || null;
    state.sportsMarathons = Array.isArray(payload?.marathon_candidates) ? payload.marathon_candidates : [];
    state.sportsConnectionStatus = {
      ...(state.sportsConnectionStatus || {}),
      ...(payload?.sync_state || {}),
      last_sync_error: payload?.sync_state?.last_error || "",
      last_run: Array.isArray(payload?.sync_history) && payload.sync_history.length ? payload.sync_history[0] : (state.sportsConnectionStatus?.last_run || null),
      storage: payload?.storage || state.sportsConnectionStatus?.storage || null,
    };
    renderSportsSummary();
    renderSportsTargetEventForm();
    renderSportsMarathons();
    await loadRaceReviews();
    renderStats();
    renderView();
  } catch (error) {
    state.sportsSummary = { status: "error", message: error.message || "Unable to refresh sports summary." };
    state.sportsTargetEvent = null;
    state.sportsMarathons = [];
    state.raceReviews = [];
    renderSportsSummary();
    renderSportsTargetEventForm();
    renderSportsMarathons();
    renderRaceReviews();
    renderStats();
    renderView();
  }
};

const renderSportsTargetEventForm = () => {
  if (!sportsTargetEventForm) return;
  const nameInput = document.getElementById("sports-target-event-name");
  const dateInput = document.getElementById("sports-target-event-date");
  const distanceInput = document.getElementById("sports-target-event-distance-km");
  const targetTimeInput = document.getElementById("sports-target-event-target-time");
  const target = state.sportsTargetEvent || null;

  if (nameInput instanceof HTMLInputElement) nameInput.value = target?.name || "";
  if (dateInput instanceof HTMLInputElement) dateInput.value = target?.date || "";
  if (distanceInput instanceof HTMLInputElement) {
    distanceInput.value = Number.isFinite(Number(target?.distance_km)) ? String(target.distance_km) : "";
  }
  if (targetTimeInput instanceof HTMLInputElement) targetTimeInput.value = target?.target_time || "";
};

const loadSportsAiAdvice = async () => {
  if (!state.token || !state.user?.sports_enabled) return;
  const sportsStatus = document.getElementById("sports-status");
  const aiButton = sportsAiAdviceButton;
  if (aiButton) {
    aiButton.disabled = true;
    aiButton.textContent = "Generating...";
  }
  if (sportsStatus) sportsStatus.textContent = "Generating AI coaching advice...";
  try {
    const payload = await apiFetch(`${API_URL}/sports/ai-advice`, { method: "POST", body: JSON.stringify({}) });
    if (!state.sportsSummary) state.sportsSummary = { status: "ready" };
    state.sportsSummary.ai_insight = payload.ai_insight || null;
    state.sportsSummary.ai_error = payload.ai_error || null;
    renderSportsSummary();
    if (sportsStatus) {
      sportsStatus.textContent = payload.ai_insight
        ? "AI coaching advice generated."
        : (payload.ai_error || "AI coaching advice unavailable.");
    }
  } catch (error) {
    if (sportsStatus) sportsStatus.textContent = error.message || "Failed to generate AI advice.";
  } finally {
    if (aiButton) {
      aiButton.disabled = false;
      aiButton.textContent = "Generate AI advice";
    }
  }
};

const saveSportsTargetEvent = async () => {
  if (!state.token || !state.user?.sports_enabled || !sportsTargetEventForm) return;
  const name = document.getElementById("sports-target-event-name")?.value?.trim() || "";
  const date = document.getElementById("sports-target-event-date")?.value || "";
  const distanceKmValue = document.getElementById("sports-target-event-distance-km")?.value || "";
  const targetTime = document.getElementById("sports-target-event-target-time")?.value?.trim() || "";
  const statusEl = document.getElementById("sports-status");
  const distanceKm = Number(distanceKmValue);
  if (!name || !date || !targetTime || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    if (statusEl) statusEl.textContent = "Please fill event name, date, distance, and target time (HH:MM:SS).";
    return;
  }
  if (!/^\d{1,2}:\d{2}:\d{2}$/.test(targetTime)) {
    if (statusEl) statusEl.textContent = "Target time must use HH:MM:SS format.";
    return;
  }

  if (statusEl) statusEl.textContent = "Saving upcoming marathon target...";
  await apiFetch(`${API_URL}/sports/target-event`, {
    method: "PUT",
    body: JSON.stringify({
      name,
      date,
      distance_km: distanceKm,
      target_time: targetTime,
      activity_types: ["running"],
    }),
  });
  await loadSportsSummary();
  if (statusEl) statusEl.textContent = "Upcoming marathon target saved.";
};

const clearSportsTargetEvent = async () => {
  if (!state.token || !state.user?.sports_enabled) return;
  const statusEl = document.getElementById("sports-status");
  if (statusEl) statusEl.textContent = "Clearing upcoming marathon target...";
  await apiFetch(`${API_URL}/sports/target-event`, { method: "DELETE" });
  state.sportsTargetEvent = null;
  renderSportsTargetEventForm();
  await loadSportsSummary();
  if (statusEl) statusEl.textContent = "Upcoming marathon target cleared.";
};

const syncSports = async (mode = "incremental") => {
  if (!state.token || !state.user?.sports_enabled) return;
  const statusEl = document.getElementById("sports-status");
  if (statusEl) statusEl.textContent = mode === "full" ? "Running full Garmin sync..." : "Syncing latest Garmin activities...";
  try {
    await apiFetch(`${API_URL}/sports/sync`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
    await loadSportsSummary();
    if (statusEl) statusEl.textContent = mode === "full" ? "Full sync completed." : "Incremental sync completed.";
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || "Sports sync failed.";
  }
};

const renderSportsMarathons = () => {
  if (!sportsMarathonsContainer) return;
  if (!state.user?.sports_enabled) {
    sportsMarathonsContainer.innerHTML = "<p class='meta'>Enable sports analytics to load marathon candidates.</p>";
    return;
  }

  if (!state.sportsMarathons?.length) {
    sportsMarathonsContainer.innerHTML = "<p class='meta'>No marathon candidates found yet. Sync your Garmin history first.</p>";
    return;
  }

  sportsMarathonsContainer.innerHTML = state.sportsMarathons
    .map((item) => `
      <div class="exercise-admin-item">
        <div class="workout-item-header">
          <div>
            <strong>${item.name || "Marathon"}</strong>
            <div class="meta">
              ${String(item.date || "").slice(0, 10)} · ${Number(item.distance_km || 0).toFixed(1)} km · ${item.pace_min_per_km ? `${Number(item.pace_min_per_km).toFixed(2)} min/km` : "pace n/a"}
            </div>
            <div class="meta">${item.custom_workout ? `Custom file: ${item.custom_workout.file_name}` : "No custom workout uploaded"}</div>
          </div>
        </div>
        <form class="sports-upload-form" data-marathon-id="${item.activity_id}">
          <input type="file" name="file" accept=".fit,.tcx,.gpx" required />
          <button type="submit" class="ghost small">Upload FIT/TCX/GPX</button>
        </form>
      </div>
    `)
    .join("");
};

const renderRaceReviews = () => {
  if (!raceReviewsList) return;
  if (!state.user?.sports_enabled) {
    raceReviewsList.innerHTML = "<p class='meta'>Enable sports analytics to view race reviews.</p>";
    return;
  }
  const items = Array.isArray(state.raceReviews) ? state.raceReviews : [];
  if (!items.length) {
    raceReviewsList.innerHTML = "<p class='meta'>No marathon race reviews yet. Sync data and upload race files under Sports.</p>";
    return;
  }

  raceReviewsList.innerHTML = items
    .map((item) => {
      const race = item.race_review || {};
      const campaign = item.campaign || {};
      const component = race.component_scores || {};
      const metrics = race.race_metrics || {};
      const strengths = Array.isArray(race.strengths) ? race.strengths : [];
      const improvements = Array.isArray(race.improvements) ? race.improvements : [];
      const longRuns = Array.isArray(campaign.long_run_snapshot) ? campaign.long_run_snapshot : [];
      const gradeBand = scoreBandFromValue(race.race_score);
      return `
        <div class="exercise-admin-item sports-segment-item marathon-campaign-card">
          <div class="workout-item-header">
            <div>
              <strong>${escapeHtml(item.name || "Marathon")} · ${String(item.date || "").slice(0, 10)}</strong>
              <p class="meta">${Number(item.distance_km || 0).toFixed(1)} km · ${item.custom_workout ? `File: ${escapeHtml(item.custom_workout.file_name || "uploaded")}` : "No uploaded race file"} · grade ${escapeHtml(race.grade || "n/a")}</p>
              <div class="exercise-pills">
                <span class="exercise-pill score-band score-band-${gradeBand}">Race score ${Number(race.race_score || 0).toFixed(1)}</span>
                <span class="exercise-pill">Pace ${metrics.pace_min_per_km ? `${Number(metrics.pace_min_per_km).toFixed(2)} /km` : "n/a"}</span>
                <span class="exercise-pill">Avg HR ${metrics.avg_hr ?? "n/a"}</span>
                <span class="exercise-pill">Split std ${metrics.split_pace_std ?? "n/a"}</span>
                <span class="exercise-pill">Drift ${Number(metrics.pace_drift_pct || 0).toFixed(1)}%</span>
              </div>
              <details class="campaign-analysis" open>
                <summary>Open coach review</summary>
                <p class="meta">Component scores: pace ${Number(component.pace || 0).toFixed(1)}, split stability ${Number(component.split_stability || 0).toFixed(1)}, fade control ${Number(component.fade_control || 0).toFixed(1)}, HR control ${Number(component.hr_control || 0).toFixed(1)}.</p>
                <strong>What went well</strong>
                <ul class="meta">${strengths.length ? strengths.map((line) => `<li>${escapeHtml(line)}</li>`).join("") : "<li>No strengths detected yet.</li>"}</ul>
                <strong>Coach actions</strong>
                <ul class="meta">${improvements.length ? improvements.map((line) => `<li>${escapeHtml(line)}</li>`).join("") : "<li>No improvements suggested.</li>"}</ul>
                <strong>Build context</strong>
                <p class="meta">Campaign ${escapeHtml(campaign.review_summary || "n/a")} · weekly ${Number(campaign.avg_weekly_distance_km || 0).toFixed(1)} km · peak ${Number(campaign.peak_week_km || 0).toFixed(1)} km · consistency ${Number(campaign.consistency_pct || 0).toFixed(0)}%.</p>
                <ul class="meta">
                  ${longRuns.length
                    ? longRuns.slice(0, 5).map((run) => `<li>${escapeHtml(run.date || "n/a")}: ${Number(run.distance_km || 0).toFixed(1)} km | pace ${run.pace_min_per_km ? Number(run.pace_min_per_km).toFixed(2) : "n/a"}/km | HR ${run.avg_hr ?? "n/a"} | splits ${Number(run.split_count || 0)} | intervals ${Number(run.interval_count || 0)}</li>`).join("")
                    : "<li>No long-run entries available for this block.</li>"}
                </ul>
              </details>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
};

const loadRaceReviews = async () => {
  if (!state.token || !state.user?.sports_enabled) {
    state.raceReviews = [];
    renderRaceReviews();
    return;
  }
  const statusEl = document.getElementById("race-reviews-status");
  if (statusEl) statusEl.textContent = "Generating marathon race reviews...";
  try {
    const payload = await apiFetch(`${API_URL}/sports/race-reviews`);
    state.raceReviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
    renderRaceReviews();
    if (statusEl) statusEl.textContent = state.raceReviews.length
      ? `Loaded ${state.raceReviews.length} race review${state.raceReviews.length === 1 ? "" : "s"}.`
      : "No race reviews yet. Upload marathon workout files in Sports.";
  } catch (error) {
    state.raceReviews = [];
    renderRaceReviews();
    if (statusEl) statusEl.textContent = error.message || "Failed to load race reviews.";
  }
};

const renderSportsAnalysisPanels = () => {
  if (!sportsAnalysisPanels) return;
  if (!state.user?.sports_enabled) {
    sportsAnalysisPanels.innerHTML = "<p class='meta'>Enable sports analytics to show analysis dashboards.</p>";
    return;
  }
  const payload = state.sportsSummary || {};
  if (!payload || payload.status !== "ready") {
    sportsAnalysisPanels.innerHTML = "<p class='meta'>Run sync or refresh to populate analysis dashboards.</p>";
    return;
  }

  const hr = payload.hr_intervals || {};
  const marathonReview = payload.marathon_review || {};
  const marathonCampaigns = payload.marathon_campaigns || {};
  const upcomingCampaign = payload.upcoming_event_campaign || null;
  const events = Array.isArray(payload.event_results) ? payload.event_results : [];
  const aiHistory = Array.isArray(payload.ai_history) ? payload.ai_history : [];
  const campaignItems = Array.isArray(marathonCampaigns.campaigns_with_current)
    ? marathonCampaigns.campaigns_with_current
    : Array.isArray(marathonCampaigns.campaigns)
      ? marathonCampaigns.campaigns
      : [];

  const eventCards = events.length
    ? events
        .map((event) => `
          <div class="exercise-admin-item sports-segment-item">
            <div class="workout-item-header">
              <div>
                <strong>${event.name || "Event"} · ${(Number(event.probability || 0) * 100).toFixed(0)}%</strong>
                <p class="meta">${event.date || "n/a"} · ${Number(event.distance_km || 0).toFixed(1)} km · confidence ${event.confidence || "n/a"}</p>
                <p class="meta">Readiness ${Number(event.context?.readiness_score || 0).toFixed(1)} · Avg weekly ${Number(event.context?.avg_weekly_distance_km || 0).toFixed(1)} km</p>
              </div>
            </div>
          </div>
        `)
        .join("")
    : "<p class='meta'>No event goals configured in goals.yaml.</p>";

  const topMarathons = (marathonReview.marathons || []).slice(0, 4)
    .map((item) => `
      <li>${String(item.date || "").slice(0, 10)} · ${item.name || "Marathon"} · score ${Number(item.score || 0).toFixed(1)}${item.pace_drift_pct !== undefined ? ` · drift ${Number(item.pace_drift_pct || 0).toFixed(1)}%` : ""}</li>
    `)
    .join("");

  const sortedByScore = [...campaignItems].sort((a, b) => Number(b.campaign_score || 0) - Number(a.campaign_score || 0));
  const bestCampaign = sortedByScore[0] || null;
  const weakestCampaign = sortedByScore.length ? sortedByScore[sortedByScore.length - 1] : null;
  const campaignAvg = campaignItems.length
    ? campaignItems.reduce((sum, item) => sum + (Number(item.campaign_score) || 0), 0) / campaignItems.length
    : 0;
  const trendDelta = Number(marathonCampaigns.trend_delta || 0);
  const kpiCards = `
    <div class="marathon-kpi-grid">
      <div class="marathon-kpi-card">
        <div class="marathon-kpi-label">Campaign average</div>
        <div class="marathon-kpi-value">${Number(campaignAvg || 0).toFixed(1)}/100</div>
        <div class="meta">Grade ${scoreBandLabel(scoreBandFromValue(campaignAvg))}</div>
      </div>
      <div class="marathon-kpi-card">
        <div class="marathon-kpi-label">Best campaign</div>
        <div class="marathon-kpi-value">${bestCampaign ? Number(bestCampaign.campaign_score || 0).toFixed(1) : "n/a"}/100</div>
        <div class="meta">${bestCampaign ? escapeHtml(bestCampaign.marathon_name || bestCampaign.event?.name || "Campaign") : "No campaigns yet"}</div>
      </div>
      <div class="marathon-kpi-card">
        <div class="marathon-kpi-label">Weakest campaign</div>
        <div class="marathon-kpi-value">${weakestCampaign ? Number(weakestCampaign.campaign_score || 0).toFixed(1) : "n/a"}/100</div>
        <div class="meta">${weakestCampaign ? escapeHtml(weakestCampaign.marathon_name || weakestCampaign.event?.name || "Campaign") : "No campaigns yet"}</div>
      </div>
      <div class="marathon-kpi-card">
        <div class="marathon-kpi-label">Trend</div>
        <div class="marathon-kpi-value">${trendDelta >= 0 ? "+" : ""}${Number(trendDelta || 0).toFixed(1)}</div>
        <div class="meta">score delta vs previous</div>
      </div>
    </div>
  `;

  const campaignRows = campaignItems.slice(0, 8)
    .map((campaign) => {
      const band = scoreBandFromValue(campaign.campaign_score);
      const reviewHighlights = Array.isArray(campaign.review_highlights) ? campaign.review_highlights : [];
      const coachActions = Array.isArray(campaign.coach_actions) ? campaign.coach_actions : [];
      const component = campaign.component_scores || {};
      const longRuns = Array.isArray(campaign.long_run_snapshot) ? campaign.long_run_snapshot : [];
      const title = campaign.status === "current"
        ? `Current - ${campaign.event?.name || campaign.marathon_name || "Target campaign"}`
        : `${String(campaign.marathon_date || "").slice(0, 10)} - ${campaign.marathon_name || "Campaign"}`;
      const period = campaign.campaign_start && campaign.campaign_end
        ? `${campaign.campaign_start} -> ${campaign.campaign_end}`
        : `Last ${Number(campaign.prep_days || 84)} days`;
      return `
        <div class="exercise-admin-item sports-segment-item marathon-campaign-card">
          <div class="workout-item-header">
            <div>
              <strong>${escapeHtml(title)}</strong>
              <p class="meta">${escapeHtml(period)} · Grade ${escapeHtml(campaign.grade || scoreBandLabel(band))} (${Number(campaign.campaign_score || 0).toFixed(1)}/100) · Campaign avg ${Number(campaign.avg_weekly_distance_km || 0).toFixed(1)} km/week</p>
              <div class="exercise-pills">
                <span class="exercise-pill score-band score-band-${band}">${scoreBandLabel(band)} ${Number(campaign.campaign_score || 0).toFixed(1)}</span>
                <span class="exercise-pill">Peak week ${Number(campaign.peak_week_km || 0).toFixed(1)} km</span>
                <span class="exercise-pill">Runs/week ${Number(campaign.runs_per_week || 0).toFixed(2)}</span>
                <span class="exercise-pill">Weekly ${Number(campaign.avg_weekly_distance_km || 0).toFixed(1)} km</span>
                <span class="exercise-pill">Long run ${Number(campaign.longest_prep_run_km || 0).toFixed(1)} km</span>
              </div>
              <div class="campaign-metric-grid">
                <span>Current 7-day load: ${Number(payload.summary?.last_7_days?.distance_km || 0).toFixed(1)} km</span>
                <span>18k+ runs: ${Number(campaign.runs_18k_plus || 0)}</span>
                <span>24k+ runs: ${Number(campaign.runs_24k_plus || 0)}</span>
                <span>28k+ runs: ${Number(campaign.runs_28k_plus || 0)}</span>
                <span>Consistency: ${Number(campaign.consistency_pct || 0).toFixed(0)}%</span>
                <span>Benchmark pace: ${campaign.benchmark_pace_min_per_km ? `${Number(campaign.benchmark_pace_min_per_km).toFixed(2)} /km` : "n/a"}</span>
              </div>
              <p class="meta">${escapeHtml(campaign.review_summary || "")}${campaign.event_detail_used ? " · using uploaded marathon file detail" : ""}</p>
              <ul class="meta">${reviewHighlights.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
              <details class="campaign-analysis" ${campaign.status === "current" ? "open" : ""}>
                <summary>Open coach analysis</summary>
                <p class="meta">Component scores: volume ${Number(component.volume || 0).toFixed(1)}, long run ${Number(component.long_run || 0).toFixed(1)}, consistency ${Number(component.consistency || 0).toFixed(1)}, specificity ${Number(component.specificity || 0).toFixed(1)}</p>
                <strong>Coach actions</strong>
                <ul class="meta">${coachActions.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
                <strong>Long-run snapshot (&gt;=18 km)</strong>
                <ul class="meta">
                  ${longRuns.length
                    ? longRuns
                      .map((run) => `<li>${escapeHtml(run.date || "n/a")}: ${Number(run.distance_km || 0).toFixed(1)} km | pace ${run.pace_min_per_km ? Number(run.pace_min_per_km).toFixed(2) : "n/a"}/km | HR ${run.avg_hr ?? "n/a"} | splits ${Number(run.split_count || 0)} | intervals ${Number(run.interval_count || 0)}</li>`)
                      .join("")
                    : "<li>No long-run records in this block yet.</li>"}
                </ul>
              </details>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const campaignSeries = (marathonCampaigns.campaigns || []).slice(0, 6).reverse();
  const campaignScoreSeries = campaignSeries.map((item) => Number(item.campaign_score || 0));
  const marathonScoreSeries = campaignSeries.map((item) => Number(item.marathon_score || 0));
  const chartWidth = 560;
  const chartHeight = 180;
  const campaignPath = buildLinePath(campaignScoreSeries, chartWidth, chartHeight);
  const marathonPath = buildLinePath(marathonScoreSeries, chartWidth, chartHeight);
  const chartLabels = campaignSeries.map((item) => String(item.marathon_date || "").slice(0, 10));
  const campaignChart = campaignSeries.length
    ? `
      <div class="sports-chart">
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}" preserveAspectRatio="none" role="img" aria-label="Campaign score trends">
          <path class="chart-line chart-line-campaign" d="${campaignPath}" />
          <path class="chart-line chart-line-marathon" d="${marathonPath}" />
        </svg>
        <div class="sports-chart-legend">
          <span class="legend-campaign">Campaign score</span>
          <span class="legend-marathon">Marathon score</span>
        </div>
        <p class="meta">Events: ${chartLabels.join(" · ")}</p>
      </div>
    `
    : "<p class='meta'>No campaign graph yet.</p>";

  const upcomingEventCard = upcomingCampaign
    ? `
      <strong>Upcoming marathon block: ${escapeHtml(upcomingCampaign.event?.name || "Target event")}</strong>
      <p class="meta">
        ${String(upcomingCampaign.event?.date || "").slice(0, 10)} · ${Number(upcomingCampaign.event?.distance_km || 0).toFixed(1)} km · target ${escapeHtml(upcomingCampaign.event?.target_time || "n/a")}
      </p>
      <div class="exercise-pills">
        <span class="exercise-pill score-band score-band-${escapeHtml(upcomingCampaign.color_code || "red")}">${escapeHtml(scoreBandLabel(upcomingCampaign.trend_label || "weak"))} (${Number(upcomingCampaign.campaign_score || 0).toFixed(1)})</span>
        <span class="exercise-pill">Weekly ${Number(upcomingCampaign.avg_weekly_distance_km || 0).toFixed(1)} km</span>
        <span class="exercise-pill">Long run ${Number(upcomingCampaign.longest_prep_run_km || 0).toFixed(1)} km</span>
      </div>
      <p class="meta">
        Block ${escapeHtml(upcomingCampaign.campaign_start || "n/a")} → ${escapeHtml(upcomingCampaign.campaign_end || "n/a")} ·
        Target pace ${upcomingCampaign.target_pace_min_per_km ? Number(upcomingCampaign.target_pace_min_per_km).toFixed(2) : "n/a"} min/km ·
        Benchmark ${upcomingCampaign.benchmark_pace_min_per_km ? Number(upcomingCampaign.benchmark_pace_min_per_km).toFixed(2) : "n/a"} min/km
      </p>
      ${upcomingCampaign.matched_campaign ? `
        <p class="meta">
          Closest historical campaign: ${escapeHtml(upcomingCampaign.matched_campaign.marathon_name || "Marathon")} (${String(upcomingCampaign.matched_campaign.marathon_date || "").slice(0, 10)})
          · score ${Number(upcomingCampaign.matched_campaign.campaign_score || 0).toFixed(1)}
          · delta ${Number(upcomingCampaign.matched_campaign.score_delta || 0).toFixed(1)}
        </p>
      ` : "<p class='meta'>No historical campaign available yet for matching.</p>"}
    `
    : "<p class='meta'>Set an upcoming marathon target above to review your current training block.</p>";

  const aiHistoryRows = aiHistory.slice(0, 6)
    .map((item) => `
      <div class="exercise-admin-item sports-segment-item">
        <div class="workout-item-header">
          <div>
            <strong>${item.generated_at ? new Date(item.generated_at).toLocaleString() : "AI note"} · ${escapeHtml(item.source || "on_demand")}</strong>
            <p class="meta">${escapeHtml(item.insight_text || item.error_text || "No message.")}</p>
          </div>
        </div>
      </div>
    `)
    .join("");

  sportsAnalysisPanels.innerHTML = `
    <section class="sports-segment">
      <h3 class="sports-segment-title">Marathon Analysis</h3>
      ${kpiCards}
      <div class="exercise-admin-item sports-segment-item">
        <div class="workout-item-header">
          <div>
            ${upcomingEventCard}
          </div>
        </div>
      </div>
    </section>
    <section class="sports-segment">
      <h3 class="sports-segment-title">Preparation Campaigns</h3>
      <div class="exercise-admin-item sports-segment-item">
        <div class="workout-item-header">
          <div>
            <strong>Campaign trend graph</strong>
            ${campaignChart}
          </div>
        </div>
      </div>
      ${campaignRows || "<p class='meta'>No campaign data yet.</p>"}
    </section>
    <section class="sports-segment">
      <h3 class="sports-segment-title">Training physiology snapshot</h3>
      <div class="exercise-admin-item sports-segment-item">
        <div class="workout-item-header">
          <div>
            <strong>Heart rate & intervals</strong>
            <p class="meta">Avg HR ${hr.avg_hr ?? "n/a"} · Max HR ${hr.max_hr ?? "n/a"} · Split avg HR ${hr.split_avg_hr ?? "n/a"}</p>
            <p class="meta">Interval sessions ${Number(hr.activities_with_intervals || 0)} · Total intervals ${Number(hr.total_intervals_detected || 0)}</p>
          </div>
        </div>
      </div>
      <div class="exercise-admin-item sports-segment-item">
        <div class="workout-item-header">
          <div>
            <strong>Marathon review</strong>
            <p class="meta">Overall ${Number(marathonReview.overall_score || 0).toFixed(1)} / 100 · Trend ${Number(marathonReview.trend_score_delta || 0).toFixed(1)}</p>
            <ul class="meta">${topMarathons || "<li>No marathon runs (>=40km) found yet.</li>"}</ul>
          </div>
        </div>
      </div>
    </section>
    <section class="sports-segment">
      <h3 class="sports-segment-title">Event targets</h3>
      ${eventCards}
    </section>
    <section class="sports-segment">
      <h3 class="sports-segment-title">AI review history</h3>
      <div class="workout-item-header">
        <div>
          <p class="meta">Stored AI notes are saved and can be reviewed later.</p>
        </div>
      </div>
      ${aiHistoryRows || "<p class='meta'>No AI reviews stored yet.</p>"}
    </section>
  `;
};

const uploadSportsWorkoutFile = async (activityId, file) => {
  if (!activityId || !file) return;
  const formData = new FormData();
  formData.append("file", file);

  await apiFetch(`${API_URL}/sports/marathons/${encodeURIComponent(activityId)}/workout-file`, {
    method: "POST",
    body: formData,
  });
  await loadSportsSummary();
};

const renderAdminList = (items = []) => {
  if (!adminList) return;
  if (!items.length) {
    adminList.innerHTML = "<p class='meta'>No exercises saved yet.</p>";
    return;
  }

  adminList.innerHTML = items
    .map(
      (exercise) => `
        <div class="exercise-admin-item">
          <div class="workout-item-header">
            <div>
              <strong>${exercise.name}</strong>
              <div class="meta">${exercise.category || "general"} · ${exercise.bodyweight ? "bodyweight" : "weighted"}</div>
            </div>
            <button class="ghost small" type="button" data-edit-exercise-id="${exercise.id}">Edit</button>
          </div>
        </div>
      `,
    )
    .join("");
};

const loadAdminExercises = async () => {
  if (!state.token) return;

  try {
    const exercises = await apiFetch(`${API_URL}/exercises`);
    state.adminExercises = exercises;
    renderAdminList(exercises);
  } catch (error) {
    state.adminExercises = [];
    console.error(error);
  }
};

const renderDogExerciseRows = () => {
  if (!dogExerciseList) return;

  dogExerciseList.innerHTML = state.dogExercises
    .map((exercise, index) => {
      const options = state.dogExerciseOptions.length
        ? state.dogExerciseOptions
            .map(
              (option) =>
                `<option value="${option.name}" ${option.name === exercise.name ? "selected" : ""}>${option.name}</option>`,
            )
            .join("")
        : "<option value=''>No dog exercises loaded</option>";

      return `
        <div class="exercise-row">
          <select data-index="${index}" data-field="name" data-kind="dog">
            <option value="">Select a dog exercise</option>
            ${options}
          </select>
          <input type="number" min="0" placeholder="Reps" data-index="${index}" data-field="reps" data-kind="dog" value="${exercise.reps}" />
          <input type="number" min="0" placeholder="Min" data-index="${index}" data-field="duration_minutes" data-kind="dog" value="${exercise.duration_minutes}" />
          <label class="checkbox-wrap">
            <input type="checkbox" data-index="${index}" data-field="rewarded" data-kind="dog" ${exercise.rewarded ? "checked" : ""} />
            Rewarded
          </label>
          <input type="text" placeholder="Notes" data-index="${index}" data-field="notes" data-kind="dog" value="${exercise.notes || ""}" />
          <button type="button" class="remove-btn" data-index="${index}" data-kind="dog">Remove</button>
        </div>
      `;
    })
    .join("");
};

const renderDogList = () => {
  if (!dogList) return;

  if (!state.dogs.length) {
    dogList.innerHTML = "<p class='meta'>No dogs yet. Add your first dog above.</p>";
    return;
  }

  dogList.innerHTML = state.dogs
    .map(
      (dog) => `
        <div class="exercise-admin-item">
          <div class="workout-item-header">
            <div>
              <strong>${dog.name}</strong>
              <p class="meta">${dog.breed || "Unknown breed"}${dog.birth_year ? ` · Born ${dog.birth_year}` : ""}</p>
            </div>
            <div class="list-inline-actions">
              <button class="ghost small" type="button" data-edit-dog-id="${dog.id}">Edit</button>
              <button class="remove-btn" type="button" data-delete-dog-id="${dog.id}">Delete</button>
            </div>
          </div>
          ${dog.notes ? `<p class="meta">${dog.notes}</p>` : ""}
        </div>
      `,
    )
    .join("");
};

const renderDogSelectOptions = () => {
  if (!dogSelect) return;

  if (!state.dogs.length) {
    dogSelect.innerHTML = "<option value=''>Add a dog in Admin first</option>";
    return;
  }

  dogSelect.innerHTML = state.dogs.map((dog) => `<option value="${dog.id}">${dog.name}</option>`).join("");
};

const renderDogExerciseAdminList = (items = []) => {
  if (!dogExerciseAdminList) return;

  if (!items.length) {
    dogExerciseAdminList.innerHTML = "<p class='meta'>No dog exercises saved yet.</p>";
    return;
  }

  dogExerciseAdminList.innerHTML = items
    .map(
      (exercise) => `
        <div class="exercise-admin-item">
          <div class="workout-item-header">
            <div>
              <strong>${exercise.name}</strong>
              <p class="meta">${exercise.category || "general"}</p>
            </div>
            <button class="ghost small" type="button" data-edit-dog-exercise-id="${exercise.id}">Edit</button>
          </div>
        </div>
      `,
    )
    .join("");
};

const renderDogWorkoutList = () => {
  if (!dogWorkoutList) return;

  if (!state.dogWorkouts.length) {
    dogWorkoutList.innerHTML = "<p class='meta'>No dog training sessions logged yet.</p>";
    return;
  }

  const dogNamesById = state.dogs.reduce((map, dog) => {
    map[dog.id] = dog.name;
    return map;
  }, {});

  dogWorkoutList.innerHTML = state.dogWorkouts
    .map(
      (session) => `
        <article class="workout-item">
          <div class="workout-item-header">
            <div>
              <h3>${session.session_name}</h3>
              <p class="meta">${session.date} · ${dogNamesById[session.dog_id] || "Unknown dog"}</p>
            </div>
            <div class="list-inline-actions">
              <button class="ghost small" type="button" data-edit-dog-workout-id="${session.id}">Edit</button>
              <button class="remove-btn" type="button" data-delete-dog-workout-id="${session.id}">Delete</button>
            </div>
          </div>
          <p class="meta">Total minutes: ${session.total_minutes || 0}</p>
          ${session.notes ? `<p>${session.notes}</p>` : ""}
          <div class="exercise-pills">
            ${(session.exercises || [])
              .map(
                (exercise) =>
                  `<span class="exercise-pill">${exercise.name}: ${exercise.reps || 0} reps · ${exercise.duration_minutes || 0} min${exercise.rewarded ? " · rewarded" : ""}</span>`,
              )
              .join("")}
          </div>
        </article>
      `,
    )
    .join("");
};

const addDogExerciseRow = () => {
  state.dogExercises.push({ name: "", reps: "", duration_minutes: "", rewarded: false, notes: "" });
  renderDogExerciseRows();
};

const loadDogs = async () => {
  if (!state.token) return;

  try {
    const dogs = await apiFetch(`${API_URL}/dogs`);
    state.dogs = dogs;
    renderDogList();
    renderDogSelectOptions();
  } catch (error) {
    console.error(error);
  }
};

const loadDogExerciseOptions = async () => {
  if (!state.token) return;

  try {
    const exercises = await apiFetch(`${API_URL}/dog-exercises`);
    state.dogExerciseOptions = exercises;
    state.adminDogExercises = exercises;

    if (!state.dogExercises[0]?.name && exercises.length) {
      state.dogExercises[0].name = exercises[0].name;
    }

    renderDogExerciseRows();
    renderDogExerciseAdminList(exercises);
  } catch (error) {
    state.adminDogExercises = [];
    console.error(error);
  }
};

const loadDogWorkouts = async () => {
  if (!state.token || !state.user?.dog_training_enabled) return;

  try {
    const sessions = await apiFetch(`${API_URL}/dog-workouts`);
    state.dogWorkouts = sessions;
    renderDogWorkoutList();
    renderStats();
  } catch (error) {
    if (dogWorkoutList) dogWorkoutList.innerHTML = "<p class='meta'>Unable to load dog sessions right now.</p>";
    console.error(error);
  }
};

const syncJournalFormValues = (entry = null) => {
  const title = entry ? entry.title || "" : "";
  const description = entry ? entry.description || "" : "";

  const titleInput = document.getElementById("journal-title");
  const descriptionInput = document.getElementById("journal-description");
  if (titleInput) titleInput.value = title;
  if (descriptionInput) descriptionInput.value = description;

  if (journalModalTitleInput) journalModalTitleInput.value = title;
  if (journalModalDescription) journalModalDescription.value = description;
  const categoryInput = document.getElementById("journal-category");
  const categoryValue = entry && entry.category ? entry.category : getEffectiveJournalCategory();
  if (categoryInput) categoryInput.value = categoryValue;
};

const setJournalFormMode = (entry = null) => {
  state.editingJournalId = entry ? entry.id : null;

  if (entry) {
    syncJournalFormValues(entry);
  } else if (journalForm) {
    journalForm.reset();
    if (journalModalTitleInput) journalModalTitleInput.value = "";
    if (journalModalDescription) journalModalDescription.value = "";
  }

  const showDeleteButton = Boolean(state.editingJournalId);
  if (saveJournalButton) {
    saveJournalButton.textContent = state.editingJournalId ? "Update entry" : "Save entry";
  }
  if (cancelJournalEditButton) {
    cancelJournalEditButton.classList.toggle("hidden", !state.editingJournalId);
  }
  if (journalModalSaveButton) {
    journalModalSaveButton.textContent = state.editingJournalId ? "Update entry" : "Save entry";
  }
  if (journalModalDeleteButton) {
    journalModalDeleteButton.classList.toggle("hidden", !showDeleteButton);
  }
  if (journalModalTitle) {
    journalModalTitle.textContent = state.editingJournalId ? "Edit journal entry" : "New journal entry";
  }
  const modalCategoryInput = document.getElementById("journal-category");
  if (modalCategoryInput) {
    modalCategoryInput.value = getEffectiveJournalCategory();
  }
};

const openJournalModal = (entry = null) => {
  if (!journalModal) return;
  setJournalFormMode(entry);
  journalModal.classList.remove("hidden");
  journalModal.setAttribute("aria-hidden", "false");
  const focusTarget = entry ? journalModalTitleInput : journalModalTitleInput;
  if (focusTarget) {
    requestAnimationFrame(() => focusTarget.focus());
  }
};

const closeJournalModal = () => {
  if (!journalModal) return;
  journalModal.classList.add("hidden");
  journalModal.setAttribute("aria-hidden", "true");
  if (state.editingJournalId) {
    setJournalFormMode(null);
  }
};

const renderJournalList = () => {
  if (!journalList) return;

  if (!state.journals.length) {
    journalList.innerHTML = "<p class='meta'>No journal entries yet.</p>";
    return;
  }

  journalList.innerHTML = state.journals
    .map(
      (entry) => `
        <article class="journal-item with-background ${entry.reported ? "reported" : "unreported"}" data-journal-entry-id="${entry.id}"${getDecorativeBackgroundStyle(entry.title || entry.category || "Journal", entry.id)}>
          <div class="journal-item-header">
            <div class="journal-item-main">
              <div class="journal-item-meta-row">
                <span class="journal-status ${entry.reported ? "reported" : "unreported"}">${entry.reported ? "Reported" : "Unreported"}</span>
                <span class="meta">${entry.category || "Professional"}</span>
                <span class="meta">${entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : ""}</span>
              </div>
              <h3>${entry.title}</h3>
            </div>
            <div class="list-inline-actions">
              <button type="button" class="ghost small" data-edit-journal-id="${entry.id}">Edit</button>
              <label class="journal-toggle" title="Toggle reported status">
                <input type="checkbox" data-journal-toggle-id="${entry.id}" ${entry.reported ? "checked" : ""} />
                <span>Reported</span>
              </label>
            </div>
          </div>
          <p class="journal-summary">${entry.description ? entry.description.replace(/\s+/g, " ").trim().slice(0, 180) + (entry.description.length > 180 ? "…" : "") : "No details added."}</p>
        </article>
      `,
    )
    .join("");
};

const loadJournalEntries = async () => {
  if (!state.token) return;
  if (!state.user?.journal_enabled) {
    state.allJournals = [];
    state.journals = [];
    renderJournalList();
    setJournalFormMode(null);
    renderStats();
    return;
  }

  try {
    const entries = await apiFetch(`${API_URL}/journals`);
    const orderedEntries = [...entries].sort((a, b) => Number(a.reported) - Number(b.reported) || new Date(b.createdAt) - new Date(a.createdAt));
    state.allJournals = entries;
    const activeCategoryFilter = state.journalCategoryFilter || "all";
    const categoryFilteredEntries = orderedEntries.filter((entry) => {
      if (activeCategoryFilter === "all") return true;
      return (entry.category || "Professional") === activeCategoryFilter;
    });
    if (state.journalFilter === "unreported") {
      state.journals = categoryFilteredEntries.filter((entry) => !entry.reported);
    } else if (state.journalFilter === "reported") {
      state.journals = categoryFilteredEntries.filter((entry) => entry.reported);
    } else {
      state.journals = categoryFilteredEntries;
    }
    if (state.editingJournalId && !state.journals.some((entry) => entry.id === state.editingJournalId)) {
      setJournalFormMode(null);
    }
    renderJournalList();
    renderStats();
  } catch (error) {
    if (journalList) journalList.innerHTML = "<p class='meta'>Unable to load journal entries right now.</p>";
    console.error(error);
  }
};

const renderWorkoutList = () => {
  if (!state.workouts.length) {
    workoutList.innerHTML = "<p class='meta'>No workouts logged yet. Start by saving one above.</p>";
    return;
  }

  workoutList.innerHTML = state.workouts
    .map(
      (workout) => `
        <article class="workout-item with-background"${getDecorativeBackgroundStyle(workout.workout_name, workout.id || workout.date)}>
          <div class="workout-item-header">
            <div>
              <h3>${workout.workout_name}</h3>
              <p class="meta">${workout.date}</p>
            </div>
            <div class="list-inline-actions">
              <button class="ghost small" type="button" data-edit-workout-id="${workout.id}">Edit</button>
              <button class="remove-btn" type="button" data-delete-id="${workout.id}">Delete</button>
            </div>
          </div>
          <p class="meta">Total volume: ${workout.total_volume || 0}</p>
          ${workout.notes ? `<p>${workout.notes}</p>` : ""}
          <div class="exercise-pills">
            ${(workout.exercises || [])
              .map(
                (exercise) =>
                  `<span class="exercise-pill">${exercise.name}: ${exercise.sets}x${exercise.reps} · ${exercise.duration_minutes || 0} min</span>`,
              )
              .join("")}
          </div>
        </article>
      `,
    )
    .join("");
};

const getTaskDeadline = (task) => {
  if (task.deadline) return task.deadline;

  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 7);
  return `${defaultDate.toISOString().slice(0, 10)} (default: 1 week)`;
};

const isTaskActive = (task) => String(task.status || "Next Action").toLowerCase() !== "done";

const buildDecorativeBackgroundUrl = (label = "focus", seed = 1) => {
  const text = String(label || "focus")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ") || "focus";

  const hash = Array.from(`${seed}|${text}`).reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
  const palettes = [
    ["#d9f3e7", "#a8ddc6", "#5fb98c", "#2f7a59"],
    ["#e3f0ff", "#b8d5ff", "#7ea8e7", "#3f5f99"],
    ["#ffe8cf", "#ffc98a", "#f29b57", "#a45d2c"],
    ["#fbe9e0", "#f7c9b0", "#e48a6a", "#8b4e3d"],
  ];
  const palette = palettes[hash % palettes.length];
  const [c1, c2, c3, c4] = palette;
  const pick = (shift, range, min) => (((hash >>> shift) % range) + min);
  const dotX = pick(8, 920, 120);
  const dotY = pick(12, 420, 100);
  const lineY = pick(20, 520, 80);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="45%" stop-color="${c2}"/>
          <stop offset="100%" stop-color="${c3}"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.8">
          <stop offset="0%" stop-color="${c4}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${c4}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bg)"/>
      <circle cx="${dotX}" cy="${dotY}" r="260" fill="url(#glow)"/>
      <circle cx="${1600 - dotX}" cy="${900 - dotY}" r="220" fill="url(#glow)"/>
      <path d="M0 ${lineY} C420 ${lineY - 30}, 880 ${lineY + 40}, 1600 ${lineY - 20}" stroke="${c4}" stroke-opacity="0.24" stroke-width="28" fill="none"/>
      <path d="M0 ${lineY + 130} C460 ${lineY + 120}, 980 ${lineY + 180}, 1600 ${lineY + 90}" stroke="${c1}" stroke-opacity="0.22" stroke-width="18" fill="none"/>
      <text x="70" y="840" font-size="32" fill="${c4}" fill-opacity="0.5" font-family="Inter, Arial, sans-serif">${text}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const getTaskBackgroundStyle = (task) => {
  if (!task?.background_url) return "";
  const safeUrl = String(task.background_url).replace(/'/g, "%27").replace(/\"/g, "%22");
  return ` style="--task-bg-image: url('${safeUrl}')"`;
};

const getDecorativeBackgroundStyle = (label, seed) => {
  const url = buildDecorativeBackgroundUrl(label, seed ?? label);
  const safeUrl = String(url).replace(/'/g, "%27").replace(/\"/g, "%22");
  return ` style="--task-bg-image: url('${safeUrl}')"`;
};

const renderTaskCard = (task, { compact = false } = {}) => `
  <article class="task-item${compact ? " compact" : ""}${task?.background_url ? " with-background" : ""}"${getTaskBackgroundStyle(task)}>
    <div class="workout-item-header">
      <div>
        <strong>${task.title}</strong>
        <p class="meta">${task.category} · ${task.owner}</p>
      </div>
      <span class="task-status ${String(task.status || "Next Action").toLowerCase().replace(/\s+/g, "-")}">${task.status || "Next Action"}</span>
    </div>
    <div class="task-meta-row">
      <span class="meta">Deadline: ${getTaskDeadline(task)}</span>
      <div class="list-inline-actions">
        <button type="button" class="task-copy-button" data-edit-task-id="${task.id}">Edit</button>
        <button type="button" class="task-copy-button" data-copy-task-id="${task.id}">Copy</button>
        ${isTaskActive(task) ? `<button type="button" class="task-complete-button" data-complete-task-id="${task.id}">Done</button>` : ""}
      </div>
    </div>
    <p class="meta">Journal: <button type="button" class="task-journal-link" data-journal-task-id="${task.id}">Copy to journal</button></p>
    ${compact ? "" : `<ul class="task-subtasks">${(task.subtasks || []).map((subtask) => `<li>${subtask}</li>`).join("")}</ul>`}
  </article>
`;

const renderJournalTaskPanel = () => {
  if (!journalTaskList) return;

  if (!state.tasks.length) {
    journalTaskList.innerHTML = "<p class='meta'>No tasks yet.</p>";
    return;
  }

  const orderedTasks = [...state.tasks].sort((a, b) => Number(isTaskActive(b)) - Number(isTaskActive(a)));
  const activeTasks = orderedTasks.filter((task) => isTaskActive(task));
  const completedTasks = orderedTasks.filter((task) => !isTaskActive(task));

  journalTaskList.innerHTML = `
    <section class="task-group">
      <h3 class="task-group-title">Active actions (${activeTasks.length})</h3>
      ${activeTasks.length ? activeTasks.map((task) => renderTaskCard(task, { compact: true })).join("") : "<p class='meta'>No active actions right now.</p>"}
    </section>
    ${completedTasks.length ? `<p class='meta'>${completedTasks.length} completed actions are hidden here.</p>` : ""}
  `;
};

const renderDashboardTasks = () => {
  const dashboardTaskList = document.getElementById("dashboard-task-list");
  if (!dashboardTaskList) return;

  if (!state.tasks.length) {
    dashboardTaskList.innerHTML = "<p class='meta'>No tasks yet. Add your first GTD task from the app data layer.</p>";
    renderJournalTaskPanel();
    return;
  }

  const orderedTasks = [...state.tasks].sort((a, b) => Number(isTaskActive(b)) - Number(isTaskActive(a)));
  const activeTasks = orderedTasks.filter((task) => isTaskActive(task));
  const inactiveTasks = orderedTasks.filter((task) => !isTaskActive(task));

  dashboardTaskList.innerHTML = `
    <section class="task-group">
      <h3 class="task-group-title">Active actions (${activeTasks.length})</h3>
      ${activeTasks.length ? activeTasks.map((task) => renderTaskCard(task)).join("") : "<p class='meta'>No active actions right now.</p>"}
    </section>
    ${inactiveTasks.length ? `<section class="task-group"><h3 class="task-group-title">Completed (${inactiveTasks.length})</h3>${inactiveTasks.map((task) => renderTaskCard(task)).join("")}</section>` : ""}
  `;

  renderJournalTaskPanel();
};

const handleCompleteTask = async (taskId) => {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !isTaskActive(task)) return;

  const confirmed = window.confirm(`Mark "${task.title}" as done?`);
  if (!confirmed) return;

  try {
    await apiFetch(`${API_URL}/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({
        title: task.title,
        category: task.category || "General",
        owner: task.owner || "@me",
        deadline: task.deadline || "",
        status: "Done",
        journal_label: task.journal_label || "Journal",
        journal_category: task.journal_category || "Professional",
        subtasks: task.subtasks || [],
      }),
    });
    await loadTasks();
  } catch (error) {
    alert(error.message || "Could not complete the task.");
  }
};

const copyTaskToClipboard = async (taskId) => {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  const taskText = [
    `- [ ] ${task.title}`,
    `  - Category: ${task.category || "General"}`,
    `  - Owner: ${task.owner || "@me"}`,
    `  - Deadline: ${getTaskDeadline(task)}`,
    `  - Status: ${task.status || "Next Action"}`,
    `  - Journal: ${task.journal_label || "Journal"}`,
    `  - Journal category: ${task.journal_category || "Professional"}`,
    "  - Subtasks:",
    ...(task.subtasks || []).map((subtask) => `    - ${subtask}`),
  ].join("\n");

  try {
    await navigator.clipboard.writeText(taskText);
    alert("Task copied to clipboard.");
  } catch (error) {
    window.prompt("Copy this task:", taskText);
  }
};

const copyTaskToJournal = async (taskId) => {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  const journalCategory = task.journal_category || "Professional";
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks.filter(Boolean) : [];
  const lines = [
    `Task: ${task.title}`,
    `Category: ${task.category || "General"}`,
    `Owner: ${task.owner || "@me"}`,
    `Deadline: ${getTaskDeadline(task)}`,
    `Status: ${task.status || "Next Action"}`,
    "",
    "Subtasks:",
    ...(subtasks.length ? subtasks.map((item) => `- ${item}`) : ["- None"]),
  ];

  try {
    await apiFetch(`${API_URL}/journals`, {
      method: "POST",
      body: JSON.stringify({
        title: task.journal_label ? `${task.journal_label}: ${task.title}` : task.title,
        description: lines.join("\n"),
        category: journalCategory,
      }),
    });

    state.journalCategoryFilter = journalCategory;
    state.currentView = "journal";
    renderView();
    if (journalList) {
      await loadJournalEntries();
    }
    alert("Task copied to journal.");
  } catch (error) {
    alert(error.message || "Could not copy task to journal.");
  }
};

const handleEditTask = async (taskId) => {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  const statusOptions = ["Next Action", "Waiting", "Scheduled", "Someday", "Done"];
  const knownCategories = Array.from(new Set(["General", ...state.tasks.map((item) => item.category).filter(Boolean)]));

  openEditModal({
    title: "Edit task",
    submitLabel: "Update task",
    fields: [
      { name: "title", label: "Title", type: "text", value: task.title || "", required: true, minLength: 2, maxLength: 120 },
      {
        name: "category",
        label: "Category",
        type: "select",
        value: task.category || "General",
        options: knownCategories.map((value) => ({ value, label: value })),
        help: "Choose an existing category to keep the board tidy.",
      },
      { name: "owner", label: "Owner", type: "text", value: task.owner || "@me", maxLength: 64 },
      {
        name: "deadline",
        label: "Deadline",
        type: "date",
        value: task.deadline || "",
        help: "Optional. Leave empty if this is open-ended.",
        validate: (value) => (value && !isIsoDate(value) ? "Deadline must be a valid date." : ""),
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        value: task.status || "Next Action",
        options: statusOptions.map((value) => ({ value, label: value })),
      },
      { name: "journal_label", label: "Journal label", type: "text", value: task.journal_label || "Journal", maxLength: 60 },
      {
        name: "journal_category",
        label: "Journal category",
        type: "select",
        value: task.journal_category || "Professional",
        options: [
          { value: "Professional", label: "Professional" },
          { value: "Private", label: "Private" },
        ],
      },
      {
        name: "subtasks",
        label: "Subtasks (one per line)",
        type: "textarea",
        value: Array.isArray(task.subtasks) ? task.subtasks.join("\n") : "",
        fullWidth: true,
        help: "Use one line per subtask.",
        maxLength: 4000,
      },
    ],
    onSubmit: async (values) => {
      const subtasks = String(values.subtasks || "")
        .split(/\n|;/)
        .map((item) => item.trim())
        .filter(Boolean);

      await apiFetch(`${API_URL}/tasks/${taskId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title.trim(),
          category: values.category || "General",
          owner: values.owner.trim() || "@me",
          deadline: values.deadline || "",
          status: values.status || "Next Action",
          journal_label: values.journal_label.trim() || "Journal",
          journal_category: values.journal_category || "Professional",
          subtasks,
        }),
      });
      await loadTasks();
    },
  });
};

const loadTasks = async () => {
  if (!state.token) {
    state.tasks = [];
    renderDashboardTasks();
    return;
  }

  try {
    const tasks = await apiFetch(`${API_URL}/tasks`);
    state.tasks = tasks;
    renderDashboardTasks();
  } catch (error) {
    console.error(error);
    state.tasks = [];
    renderDashboardTasks();
  }
};

const handleTaskSubmit = async (event) => {
  event.preventDefault();

  const title = document.getElementById("task-title")?.value.trim();
  const category = document.getElementById("task-category")?.value.trim() || "General";
  const owner = document.getElementById("task-owner")?.value.trim() || "@me";
  const deadline = document.getElementById("task-deadline")?.value || "";
  const status = document.getElementById("task-status")?.value || "Next Action";
  const journalLabel = document.getElementById("task-journal-label")?.value.trim() || "Journal";
  const subtasksRaw = document.getElementById("task-subtasks")?.value || "";
  const journalCategory = document.getElementById("task-journal-category")?.value || "Professional";
  const subtasks = subtasksRaw
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!title) {
    alert("Task title is required.");
    return;
  }

  try {
    await apiFetch(`${API_URL}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title,
        category,
        owner,
        deadline,
        status,
        journal_label: journalLabel,
        journal_category: journalCategory,
        subtasks,
      }),
    });

    if (taskForm) taskForm.reset();
    document.getElementById("task-category").value = "General";
    document.getElementById("task-owner").value = "@me";
    document.getElementById("task-status").value = "Next Action";
    document.getElementById("task-journal-label").value = "Journal";
    document.getElementById("task-journal-category").value = "Professional";
    await loadTasks();
  } catch (error) {
    alert(error.message || "Could not save the task.");
  }
};

const handleJournalTaskSubmit = async (event) => {
  event.preventDefault();

  const title = document.getElementById("journal-task-title")?.value.trim();
  const status = document.getElementById("journal-task-status")?.value || "Next Action";

  if (!title) {
    alert("Task title is required.");
    return;
  }

  try {
    await apiFetch(`${API_URL}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title,
        category: "General",
        owner: "@me",
        deadline: "",
        status,
        journal_label: "Journal",
        journal_category: getEffectiveJournalCategory(),
        subtasks: [],
      }),
    });

    if (journalTaskForm) journalTaskForm.reset();
    const statusInput = document.getElementById("journal-task-status");
    if (statusInput) statusInput.value = "Next Action";
    await loadTasks();
  } catch (error) {
    alert(error.message || "Could not add the action.");
  }
};

const buildTrendBars = (values = []) => {
  const series = (values || []).slice(-7).map((value) => Number(value) || 0);
  if (!series.length) return "";
  const maxValue = Math.max(1, ...series);

  return `
    <div class="mini-trend" aria-label="Last 7 day trend">
      ${series
        .map(
          (value) => `
            <span style="height:${Math.max(18, (value / maxValue) * 100)}%" aria-hidden="true"></span>
          `,
        )
        .join("")}
    </div>
  `;
};

const buildRecentValueSeries = (items, dateKey = "date") => {
  const endDate = new Date(state.selectedDate || new Date().toISOString().slice(0, 10));
  const series = [];

  for (let index = 6; index >= 0; index -= 1) {
    const targetDate = new Date(endDate);
    targetDate.setDate(endDate.getDate() - index);
    const isoDate = targetDate.toISOString().slice(0, 10);
    const count = items.filter((item) => String(item[dateKey] || "").slice(0, 10) === isoDate).length;
    series.push(count);
  }

  return series;
};

const renderSportsSummary = () => {
  const sportsSummaryContainer = document.getElementById("sports-summary");
  const sportsStatus = document.getElementById("sports-status");
  const sportsInsight = document.getElementById("sports-ai-insight");

  if (!sportsSummaryContainer) return;

  if (!state.user?.sports_enabled) {
    sportsSummaryContainer.innerHTML = "<p class='meta'>Sports analytics is disabled for this profile.</p>";
    if (sportsStatus) {
      sportsStatus.textContent = "Turn on sports analytics in your profile to enable a Garmin summary.";
    }
    if (sportsInsight) sportsInsight.classList.add("hidden");
    renderSportsAnalysisPanels();
    renderSportsMarathons();
    return;
  }

  const sportsData = state.sportsSummary;
  if (!sportsData || sportsData.status !== "ready") {
    sportsSummaryContainer.innerHTML = `
      <div class="dashboard-summary-grid">
        <div class="dashboard-summary-card">
          <div class="summary-topline"><span>Sports status</span><strong>Queued</strong></div>
          <div class="summary-progress"><span style="width:25%"></span></div>
          <small>${sportsData?.message || "Awaiting Garmin credentials and a valid sports project."}</small>
        </div>
      </div>
    `;
    if (sportsStatus) {
      sportsStatus.textContent = sportsData?.message || "Set GARMIN_EMAIL and GARMIN_PASSWORD to sync Garmin activity data.";
    }
    if (sportsInsight) sportsInsight.classList.add("hidden");
    renderSportsAnalysisPanels();
    renderSportsMarathons();
    return;
  }

  const summary = sportsData.summary || {};
  const totals = [
    { label: "Activities", value: String(summary.total_activities ?? 0), detail: `${Number(summary.last_7_days?.activities || 0).toFixed(0)} in 7d` },
    { label: "Distance", value: `${Number(summary.total_distance_km || 0).toFixed(1)} km`, detail: `${Number(summary.last_30_days?.distance_km || 0).toFixed(1)} km in 30d` },
    { label: "Moving time", value: `${Number(summary.total_moving_hours || 0).toFixed(1)} h`, detail: `${Number(summary.last_7_days?.moving_hours || 0).toFixed(1)} h in 7d` },
    { label: "Best run", value: summary.best_run_pace_min_per_km ? `${Number(summary.best_run_pace_min_per_km).toFixed(2)} min/km` : "n/a", detail: `${Number(summary.longest_activity_km || 0).toFixed(1)} km longest` },
  ];

  sportsSummaryContainer.innerHTML = `
    <div class="dashboard-summary-grid">
      ${totals
        .map(
          (item) => `
            <div class="dashboard-summary-card">
              <div class="summary-topline"><span>${item.label}</span><strong>${item.value}</strong></div>
              <div class="summary-progress"><span style="width:70%"></span></div>
              <small>${item.detail}</small>
            </div>
          `,
        )
        .join("")}
    </div>
  `;

  if (sportsStatus) {
    sportsStatus.textContent = sportsData.message || "Garmin summary loaded.";
  }

  if (sportsInsight) {
    const aiInsight = sportsData.ai_insight || sportsData.training_review?.conversational_report || "";
    if (aiInsight) {
      sportsInsight.innerHTML = `<h3>Coaching note</h3><p>${escapeHtml(String(aiInsight)).replace(/\n+/g, "<br>")}</p>`;
      sportsInsight.classList.remove("hidden");
    } else {
      sportsInsight.classList.add("hidden");
    }
  }
  renderSportsAnalysisPanels();
  renderSportsMarathons();
};

const renderDashboardSummary = () => {
  if (!dashboardSummary) return;

  const workoutSessions = state.allWorkouts || [];
  const dogSessions = state.user?.dog_training_enabled ? state.dogWorkouts || [] : [];
  const journalEntries = state.user?.journal_enabled ? state.allJournals || [] : [];
  const journalUnreported = journalEntries.filter((entry) => !entry.reported).length;
  const activeTasks = (state.tasks || []).filter((task) => isTaskActive(task));
  const enabledModules = [
    state.user?.workouts_enabled !== false,
    Boolean(state.user?.dog_training_enabled),
    Boolean(state.user?.journal_enabled),
    Boolean(state.user?.sports_enabled),
    Boolean(state.user?.is_admin),
  ].filter(Boolean).length;
  const completionRate = ((Math.max(0, activeTasks.length) / Math.max(1, state.tasks.length || 1)) * 100).toFixed(0);
  const journalCoverage = journalEntries.length ? `${((1 - journalUnreported / Math.max(1, journalEntries.length)) * 100).toFixed(0)}%` : "0%";
  const totals = [
    { label: "Enabled modules", value: String(enabledModules), detail: `${enabledModules}/5 active`, progress: Math.round((enabledModules / 5) * 100) },
    { label: "Open actions", value: String(activeTasks.length), detail: `${state.tasks.length} total tasks`, progress: Math.min(100, Math.round((activeTasks.length / Math.max(1, state.tasks.length)) * 100)) },
    { label: "Journal coverage", value: journalCoverage, detail: `${journalEntries.length} entries logged`, progress: Number.parseInt(journalCoverage, 10) || 0 },
    { label: "Workouts", value: String(workoutSessions.length + dogSessions.length), detail: `${workoutSessions.length + dogSessions.length} sessions`, progress: Math.min(100, Math.round(((workoutSessions.length + dogSessions.length) / 10) * 100)) },
  ];

  dashboardSummary.innerHTML = `
    <div class="dashboard-summary-grid">
      ${totals
        .map(
          (item) => `
            <div class="dashboard-summary-card">
              <div class="summary-topline">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
              </div>
              <div class="summary-progress">
                <span style="width:${Math.min(100, Math.max(8, item.progress))}%"></span>
              </div>
              <small>${item.detail}</small>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
};

const renderStats = () => {
  const workoutSessions = state.allWorkouts || [];
  const dogSessions = state.user?.dog_training_enabled ? state.dogWorkouts || [] : [];
  const journalEntries = state.user?.journal_enabled ? state.allJournals || [] : [];
  const sportsSummary = state.sportsSummary;
  const journalUnreported = journalEntries.filter((entry) => !entry.reported).length;

  const totalSessions = workoutSessions.length + dogSessions.length;
  const totalExercises =
    workoutSessions.reduce((sum, workout) => sum + (workout.exercises?.length || 0), 0) +
    dogSessions.reduce((sum, session) => sum + (session.exercises?.length || 0), 0);
  const totalVolume =
    workoutSessions.reduce((sum, workout) => sum + (Number(workout.total_volume) || 0), 0) +
    dogSessions.reduce((sum, session) => sum + (Number(session.total_minutes) || 0), 0);

  const sessionsCount = document.getElementById("sessions-count");
  const exerciseCount = document.getElementById("exercise-count");
  const volumeCount = document.getElementById("volume-count");
  if (sessionsCount) sessionsCount.textContent = String(totalSessions);
  if (exerciseCount) exerciseCount.textContent = String(totalExercises);
  if (volumeCount) volumeCount.textContent = String(totalVolume);
  if (journalOpenCard) {
    journalOpenCard.classList.toggle("hidden", !state.user?.journal_enabled);
  }
  const journalOpenCount = document.getElementById("journal-open-count");
  if (journalOpenCount) {
    journalOpenCount.textContent = String(journalUnreported);
  }

  renderDashboardSummary();
  renderSportsSummary();

  if (moduleStatusList) {
    const workoutToday = workoutSessions.filter((session) => session.date === state.selectedDate).length;
    const dogToday = dogSessions.filter((session) => session.date === state.selectedDate).length;
    const workoutTrend = buildRecentValueSeries(workoutSessions, "date");
    const dogTrend = buildRecentValueSeries(dogSessions, "date");
    const journalTrend = buildRecentValueSeries(
      journalEntries.map((entry) => ({ date: entry.createdAt ? new Date(entry.createdAt).toISOString().slice(0, 10) : state.selectedDate })),
      "date",
    );
    const totalModulesEnabled = [state.user?.workouts_enabled !== false, Boolean(state.user?.dog_training_enabled), Boolean(state.user?.journal_enabled), Boolean(state.user?.sports_enabled), Boolean(state.user?.is_admin)].filter(Boolean).length;
    const sportsStatus = sportsSummary?.status === "ready" ? "Ready" : state.user?.sports_enabled ? "Needs setup" : "Disabled";

    const moduleCards = [
      {
        name: "Calisthenics",
        view: "workouts",
        locked: state.user?.workouts_enabled === false,
        statLabel: "Sessions today",
        statValue: String(workoutToday),
        detail: `${workoutSessions.length} total · ${workoutTrend.reduce((sum, value) => sum + value, 0)} in 7d`,
        lockedText: "Turn on this module in Profile",
        trend: buildTrendBars(workoutTrend),
      },
      {
        name: "Dog training",
        view: "dog",
        locked: !state.user?.dog_training_enabled,
        statLabel: "Sessions today",
        statValue: String(dogToday),
        detail: `${dogSessions.length} total · ${dogTrend.reduce((sum, value) => sum + value, 0)} in 7d`,
        lockedText: "Turn on this module in Profile",
        trend: buildTrendBars(dogTrend),
      },
      {
        name: "Journal",
        view: "journal",
        locked: !state.user?.journal_enabled,
        statLabel: "Unreported",
        statValue: String(journalUnreported),
        detail: `${journalEntries.length} total · ${journalTrend.reduce((sum, value) => sum + value, 0)} in 7d`,
        lockedText: "Turn on this module in Profile",
        trend: buildTrendBars(journalTrend),
      },
      {
        name: "Sports",
        view: "sports",
        locked: !state.user?.sports_enabled,
        statLabel: "Status",
        statValue: sportsStatus,
        detail: sportsSummary?.status === "ready" ? `Distance ${Number(sportsSummary.summary?.total_distance_km || 0).toFixed(1)} km` : "Garmin setup pending",
        lockedText: "Turn on this module in Profile",
        trend: buildTrendBars([1, 2, 3, 2, 3, 4, 3]),
      },
      {
        name: "Admin",
        view: "admin",
        locked: !state.user?.is_admin,
        statLabel: "Role",
        statValue: state.user?.is_admin ? "Admin" : "User",
        detail: `${totalModulesEnabled}/5 modules active`,
        lockedText: "Ask an administrator for access",
        trend: buildTrendBars([totalModulesEnabled, totalModulesEnabled, totalModulesEnabled, totalModulesEnabled, totalModulesEnabled, totalModulesEnabled, totalModulesEnabled]),
      },
    ];

    moduleStatusList.innerHTML = moduleCards
      .map(
        (module) => `
          <button type="button" class="module-status-card with-background${module.locked ? " is-locked" : ""}" data-module-view="${module.view}" ${module.locked ? "disabled" : ""}${getDecorativeBackgroundStyle(module.name, module.view)}>
            <div class="module-status-row">
              <strong>${module.name}</strong>
              <span class="module-status-label">${module.statLabel}</span>
            </div>
            <div class="module-stat-value">${module.statValue}</div>
            <p class="meta module-meta-line">${module.locked ? module.lockedText : module.detail}</p>
            ${module.trend || ""}
          </button>
        `,
      )
      .join("");
  }

  renderDashboardTasks();
};

const loadWorkouts = async () => {
  if (!state.token) return;

  try {
    const workouts = await apiFetch(`${API_URL}/workouts`);
    state.allWorkouts = workouts;
    const visibleWorkouts =
      state.workoutFilter === "today"
        ? workouts.filter((workout) => workout.date === state.selectedDate)
        : workouts;
    state.workouts = visibleWorkouts;
    renderWorkoutList();
    renderStats();
  } catch (error) {
    workoutList.innerHTML = "<p class='meta'>Unable to load workouts right now.</p>";
    console.error(error);
  }
};

const handleWorkoutSubmit = async (event) => {
  event.preventDefault();

  const workoutName = document.getElementById("workout-name").value;
  const notes = document.getElementById("workout-notes")?.value || "";
  const date = document.getElementById("workout-date").value;

  const cleanedExercises = state.exercises
    .map((exercise) => ({
      name: String(exercise.name || "").trim(),
      sets: Number(exercise.sets) || 0,
      reps: Number(exercise.reps) || 0,
      duration_minutes: Number(exercise.duration_minutes) || 0,
      bodyweight: Boolean(exercise.bodyweight),
      notes: String(exercise.notes || "").trim(),
    }))
    .filter((exercise) => exercise.name);

  if (!workoutName || !date || !cleanedExercises.length) {
    alert("Please choose a date, add a workout name, and include at least one exercise.");
    return;
  }

  try {
    await apiFetch(`${API_URL}/workouts`, {
      method: "POST",
      body: JSON.stringify({
        workout_name: workoutName,
        date,
        notes,
        exercises: cleanedExercises,
      }),
    });

    state.selectedDate = date;
    state.exercises = [{ name: "", sets: "", reps: "", duration_minutes: "", bodyweight: true, notes: "" }];
    renderExerciseRows();
    form.reset();
    document.getElementById("workout-date").value = date;
    setWorkoutFormVisible(false);
    await loadWorkouts();
  } catch (error) {
    alert(error.message || "Something went wrong while saving the workout.");
  }
};

const handleDeleteWorkout = async (id) => {
  const shouldDelete = window.confirm("Delete this workout?");
  if (!shouldDelete) return;

  try {
    await apiFetch(`${API_URL}/workouts/${id}`, { method: "DELETE" });
    await loadWorkouts();
  } catch (error) {
    alert(error.message || "Could not delete the workout.");
  }
};

const handleEditWorkout = async (id) => {
  const workout = state.allWorkouts.find((item) => item.id === id) || state.workouts.find((item) => item.id === id);
  if (!workout) return;

  openEditModal({
    title: "Edit workout",
    submitLabel: "Update workout",
    fields: [
      { name: "workout_name", label: "Workout name", type: "text", value: workout.workout_name || "", required: true, minLength: 2, maxLength: 120 },
      {
        name: "date",
        label: "Date",
        type: "date",
        value: workout.date || state.selectedDate || "",
        required: true,
        validate: (value) => (!isIsoDate(value) ? "Date must be valid." : ""),
      },
      { name: "notes", label: "Notes", type: "textarea", value: workout.notes || "", fullWidth: true, maxLength: 3000 },
    ],
    onSubmit: async (values) => {
      await apiFetch(`${API_URL}/workouts/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          workout_name: values.workout_name.trim(),
          date: values.date,
          notes: values.notes || "",
        }),
      });
      await loadWorkouts();
    },
  });
};

const handleLogin = async (event) => {
  event.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const otp = document.getElementById("login-otp")?.value.trim() || "";

  try {
    const payload = await apiFetch(`${API_URL}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username, password, otp }),
    });
    persistAuth(payload.token, payload.user);
    state.currentView = "dashboard";
    await loadTasks();
    await loadExerciseOptions();
    await loadWorkouts();
    await loadJournalEntries();
    if (state.user?.is_admin) {
      await loadAdminExercises();
      await loadAdminRegistrationSetting();
    }
    if (state.user?.dog_training_enabled) {
      await loadDogs();
      await loadDogWorkouts();
    }
    if (state.user?.dog_training_enabled || state.user?.is_admin) {
      await loadDogExerciseOptions();
    }
    loginForm.reset();
  } catch (error) {
    if (error.status === 401) {
      try {
        const bootstrap = await apiFetch(`${API_URL}/auth/bootstrap`, { skipAuth: true });
        if (bootstrap && !bootstrap.hasUsers) {
          alert("No accounts exist in this database yet. Please create an account first.");
          return;
        }
      } catch (bootstrapError) {
        console.error(bootstrapError);
      }
    }
    alert(error.message);
  }
};

const handleRegister = async (event) => {
  event.preventDefault();
  if (!state.registrationEnabled) {
    alert("Registration is currently disabled.");
    return;
  }
  const username = document.getElementById("register-username").value.trim();
  const password = document.getElementById("register-password").value;
  const first_name = document.getElementById("register-first-name").value.trim();

  try {
    const payload = await apiFetch(`${API_URL}/auth/register`, {
      method: "POST",
      body: JSON.stringify({ username, password, first_name }),
    });
    persistAuth(payload.token, payload.user);
    state.currentView = "dashboard";
    await loadTasks();
    await loadExerciseOptions();
    await loadWorkouts();
    await loadJournalEntries();
    if (state.user?.is_admin) {
      await loadAdminExercises();
      await loadAdminRegistrationSetting();
    }
    if (state.user?.dog_training_enabled) {
      await loadDogs();
      await loadDogWorkouts();
    }
    if (state.user?.dog_training_enabled || state.user?.is_admin) {
      await loadDogExerciseOptions();
    }
    registerForm.reset();
  } catch (error) {
    if (error.status === 403) {
      await loadRegistrationBootstrap();
    }
    alert(error.message);
  }
};

const handleProfileUpdate = async (event) => {
  event.preventDefault();

  try {
    const garminPasswordInput = document.getElementById("profile-garmin-password");
    const garminPasswordValue = garminPasswordInput ? garminPasswordInput.value : "";
    const payload = await apiFetch(`${API_URL}/profile`, {
      method: "PUT",
      body: JSON.stringify({
        first_name: document.getElementById("profile-first-name").value,
        last_name: document.getElementById("profile-last-name").value,
        email: document.getElementById("profile-email").value,
        goal: document.getElementById("profile-goal").value,
        workouts_enabled: document.getElementById("profile-workouts-enabled").checked,
        dog_training_enabled: document.getElementById("profile-dog-enabled").checked,
        journal_enabled: document.getElementById("profile-journal-enabled").checked,
        sports_enabled: document.getElementById("profile-sports-enabled").checked,
        garmin_email: document.getElementById("profile-garmin-email")?.value || "",
        garmin_password: garminPasswordValue,
        clear_garmin_password: document.getElementById("profile-clear-garmin-password")?.checked || false,
      }),
    });

    state.sportsConnectionStatus = payload?.sports_connection_status || null;
    const normalizedPayload = { ...payload };
    delete normalizedPayload.sports_connection_status;
    state.user = normalizedPayload;
    writeStoredAuth(state.token, normalizedPayload);
    renderView();
    if (payload.dog_training_enabled) {
      await loadDogs();
      await loadDogWorkouts();
    } else {
      state.dogs = [];
      state.dogWorkouts = [];
      renderDogList();
      renderDogSelectOptions();
      renderDogWorkoutList();
      renderStats();
    }
    if (payload.dog_training_enabled || payload.is_admin) {
      await loadDogExerciseOptions();
    } else {
      state.dogExerciseOptions = [];
      renderDogExerciseRows();
      renderDogExerciseAdminList([]);
    }
    if (payload.journal_enabled) {
      await loadJournalEntries();
    } else {
      state.allJournals = [];
      state.journals = [];
      setJournalFormMode(null);
      renderJournalList();
      renderStats();
    }
    if (payload.sports_enabled) {
      await loadSportsSummary();
    } else {
      state.sportsSummary = null;
      renderSportsSummary();
      renderStats();
    }
    if (payload.is_admin) {
      await loadAdminExercises();
    } else if (adminList) {
      adminList.innerHTML = "<p class='meta'>Admin access required.</p>";
    }
    if (garminPasswordInput) garminPasswordInput.value = "";
    const clearGarminPassword = document.getElementById("profile-clear-garmin-password");
    if (clearGarminPassword) clearGarminPassword.checked = false;
    alert("Profile updated.");
  } catch (error) {
    alert(error.message);
  }
};

const handleDogFormSubmit = async (event) => {
  event.preventDefault();

  const name = document.getElementById("dog-name").value.trim();
  const breed = document.getElementById("dog-breed").value.trim();
  const birthYear = document.getElementById("dog-birth-year").value;
  const notes = document.getElementById("dog-notes").value.trim();

  if (!name) {
    alert("Dog name is required.");
    return;
  }

  try {
    await apiFetch(`${API_URL}/dogs`, {
      method: "POST",
      body: JSON.stringify({
        name,
        breed,
        birth_year: birthYear ? Number(birthYear) : null,
        notes,
      }),
    });
    dogForm.reset();
    await loadDogs();
    await loadDogWorkouts();
  } catch (error) {
    alert(error.message || "Could not add dog.");
  }
};

const handleDeleteDog = async (id) => {
  const shouldDelete = window.confirm("Delete this dog and all related sessions?");
  if (!shouldDelete) return;

  try {
    await apiFetch(`${API_URL}/dogs/${id}`, { method: "DELETE" });
    await loadDogs();
    await loadDogWorkouts();
  } catch (error) {
    alert(error.message || "Could not delete dog.");
  }
};

const handleEditDog = async (id) => {
  const dog = state.dogs.find((item) => item.id === id);
  if (!dog) return;

  openEditModal({
    title: "Edit dog",
    submitLabel: "Update dog",
    fields: [
      {
        name: "name",
        label: "Dog name",
        type: "text",
        value: dog.name || "",
        required: true,
        minLength: 2,
        maxLength: 80,
        validate: (value) => {
          const duplicate = state.dogs.some((item) => item.id !== dog.id && String(item.name || "").trim().toLowerCase() === String(value || "").trim().toLowerCase());
          return duplicate ? "A dog with this name already exists." : "";
        },
      },
      { name: "breed", label: "Breed", type: "text", value: dog.breed || "", maxLength: 80 },
      {
        name: "birth_year",
        label: "Birth year",
        type: "number",
        min: 1990,
        max: 2100,
        step: 1,
        value: dog.birth_year ? String(dog.birth_year) : "",
        help: "Optional. Use four digits, for example 2021.",
        validate: (value) => {
          const trimmed = String(value || "").trim();
          if (!trimmed) return "";
          if (!/^\d{4}$/.test(trimmed)) return "Birth year must be 4 digits.";
          const year = Number(trimmed);
          if (year < 1990 || year > 2100) return "Birth year must be between 1990 and 2100.";
          return "";
        },
      },
      { name: "notes", label: "Notes", type: "textarea", value: dog.notes || "", fullWidth: true, maxLength: 3000 },
    ],
    onSubmit: async (values) => {
      const birthYear = String(values.birth_year || "").trim();
      await apiFetch(`${API_URL}/dogs/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: values.name.trim(),
          breed: String(values.breed || "").trim(),
          birth_year: birthYear ? Number(birthYear) : null,
          notes: String(values.notes || ""),
        }),
      });
      await loadDogs();
      await loadDogWorkouts();
    },
  });
};

const handleDogExerciseAdminSubmit = async (event) => {
  event.preventDefault();

  const name = document.getElementById("dog-exercise-name").value.trim();
  const category = document.getElementById("dog-exercise-category").value;

  if (!name) {
    alert("Dog exercise name is required.");
    return;
  }

  try {
    await apiFetch(`${API_URL}/dog-exercises`, {
      method: "POST",
      body: JSON.stringify({ name, category }),
    });
    dogExerciseAdminForm.reset();
    await loadDogExerciseOptions();
  } catch (error) {
    alert(error.message || "Could not save dog exercise.");
  }
};

const handleDogWorkoutSubmit = async (event) => {
  event.preventDefault();

  const dogId = document.getElementById("dog-select").value;
  const sessionName = document.getElementById("dog-workout-name").value.trim();
  const notes = document.getElementById("dog-workout-notes").value.trim();
  const date = document.getElementById("dog-workout-date").value;

  const cleanedExercises = state.dogExercises
    .map((exercise) => ({
      name: String(exercise.name || "").trim(),
      reps: Number(exercise.reps) || 0,
      duration_minutes: Number(exercise.duration_minutes) || 0,
      rewarded: Boolean(exercise.rewarded),
      notes: String(exercise.notes || "").trim(),
    }))
    .filter((exercise) => exercise.name);

  if (!dogId || !sessionName || !date || !cleanedExercises.length) {
    alert("Choose a dog, date, session name, and at least one dog exercise.");
    return;
  }

  try {
    await apiFetch(`${API_URL}/dog-workouts`, {
      method: "POST",
      body: JSON.stringify({
        dog_id: dogId,
        session_name: sessionName,
        date,
        notes,
        exercises: cleanedExercises,
      }),
    });

    state.dogExercises = [{ name: "", reps: "", duration_minutes: "", rewarded: false, notes: "" }];
    renderDogExerciseRows();
    dogWorkoutForm.reset();
    document.getElementById("dog-workout-date").value = date;
    renderDogSelectOptions();
    setDogWorkoutFormVisible(false);
    await loadDogWorkouts();
  } catch (error) {
    alert(error.message || "Something went wrong while saving the dog session.");
  }
};

const handleDeleteDogWorkout = async (id) => {
  const shouldDelete = window.confirm("Delete this dog training session?");
  if (!shouldDelete) return;

  try {
    await apiFetch(`${API_URL}/dog-workouts/${id}`, { method: "DELETE" });
    await loadDogWorkouts();
  } catch (error) {
    alert(error.message || "Could not delete the dog session.");
  }
};

const handleEditDogWorkout = async (id) => {
  const session = state.dogWorkouts.find((item) => item.id === id);
  if (!session) return;

  openEditModal({
    title: "Edit dog session",
    submitLabel: "Update session",
    fields: [
      {
        name: "dog_id",
        label: "Dog",
        type: "select",
        value: session.dog_id,
        required: true,
        options: state.dogs.map((dog) => ({ value: dog.id, label: dog.name })),
      },
      { name: "session_name", label: "Session name", type: "text", value: session.session_name || "", required: true, minLength: 2, maxLength: 120 },
      {
        name: "date",
        label: "Date",
        type: "date",
        value: session.date || state.selectedDate || "",
        required: true,
        validate: (value) => (!isIsoDate(value) ? "Date must be valid." : ""),
      },
      { name: "notes", label: "Notes", type: "textarea", value: session.notes || "", fullWidth: true, maxLength: 3000 },
    ],
    onSubmit: async (values) => {
      await apiFetch(`${API_URL}/dog-workouts/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          dog_id: values.dog_id,
          session_name: values.session_name.trim(),
          date: values.date,
          notes: values.notes || "",
        }),
      });
      await loadDogWorkouts();
    },
  });
};

const handleJournalSubmit = async (event) => {
  event.preventDefault();

  const titleInput = document.getElementById("journal-modal-title-input");
  const descriptionInput = document.getElementById("journal-modal-description");
  const categoryInput = document.getElementById("journal-category");
  const title = (titleInput?.value || "").trim();
  const description = (descriptionInput?.value || "").trim();
  const category = categoryInput?.value || getEffectiveJournalCategory();

  if (!title) {
    alert("Journal title is required.");
    return;
  }

  try {
    const isEditing = Boolean(state.editingJournalId);
    const endpoint = isEditing ? `${API_URL}/journals/${state.editingJournalId}` : `${API_URL}/journals`;
    const method = isEditing ? "PUT" : "POST";
    await apiFetch(endpoint, {
      method,
      body: JSON.stringify({ title, description, category }),
    });
    setJournalFormMode(null);
    closeJournalModal();
    await loadJournalEntries();
  } catch (error) {
    alert(error.message || "Something went wrong while saving the journal entry.");
  }
};

const handleDeleteJournal = async (id) => {
  const shouldDelete = window.confirm("Delete this journal entry?");
  if (!shouldDelete) return;

  try {
    await apiFetch(`${API_URL}/journals/${id}`, { method: "DELETE" });
    setJournalFormMode(null);
    closeJournalModal();
    await loadJournalEntries();
  } catch (error) {
    alert(error.message || "Could not delete the journal entry.");
  }
};

const handleToggleJournalReported = async (id) => {
  try {
    await apiFetch(`${API_URL}/journals/${id}/toggle-reported`, { method: "PATCH" });
    await loadJournalEntries();
  } catch (error) {
    alert(error.message || "Could not update the journal entry.");
  }
};

const handleStartJournalEdit = (id) => {
  const entry = state.journals.find((item) => item.id === id);
  if (!entry) return;
  openJournalModal(entry);
};

const handleUserAdminSubmit = async (event) => {
  event.preventDefault();

  const username = document.getElementById("user-admin-username").value.trim();
  const password = document.getElementById("user-admin-password").value;
  const first_name = document.getElementById("user-admin-first-name").value.trim();
  const last_name = document.getElementById("user-admin-last-name").value.trim();
  const email = document.getElementById("user-admin-email").value.trim();
  const goal = document.getElementById("user-admin-goal").value.trim();

  if (!username || !password) {
    alert("Username and password are required.");
    return;
  }

  try {
    await apiFetch(`${API_URL}/users`, {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        first_name,
        last_name,
        email,
        goal,
        workouts_enabled: document.getElementById("user-admin-workouts").checked,
        dog_training_enabled: document.getElementById("user-admin-dog").checked,
        journal_enabled: document.getElementById("user-admin-journal").checked,
        sports_enabled: document.getElementById("user-admin-sports").checked,
        is_admin: document.getElementById("user-admin-admin").checked,
      }),
    });
    userAdminForm.reset();
    document.getElementById("user-admin-workouts").checked = true;
    await loadUsers();
  } catch (error) {
    alert(error.message || "Could not create user.");
  }
};

const handleRegistrationToggle = async (enabled) => {
  if (!state.token || !state.user?.is_admin) return;
  try {
    const payload = await apiFetch(`${API_URL}/admin/settings/registration`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    state.registrationEnabled = payload?.registration_enabled !== false;
    state.registrationLockedOpen = Boolean(payload?.locked_open);
    renderRegistrationControls();
    await loadAdminAuditLogs();
  } catch (error) {
    await loadAdminRegistrationSetting();
    alert(error.message || "Could not update registration setting.");
  }
};

const handleUserAccessUpdate = async (userId, field, checked) => {
  try {
    await apiFetch(`${API_URL}/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ [field]: checked }),
    });
    await loadUsers();
    if (state.user?.id === userId) {
      await loadProfile({ silentInvalidSession: true });
    }
  } catch (error) {
    alert(error.message || "Could not update user access.");
  }
};

const handleDeleteUser = async (userId) => {
  const user = state.adminUsers.find((item) => item.id === userId);
  if (!user) return;
  if (state.user?.id === userId) {
    alert("You cannot delete your own account.");
    return;
  }
  const confirmed = window.confirm(`Delete user "${user.username}" and all their data? This cannot be undone.`);
  if (!confirmed) return;

  try {
    await apiFetch(`${API_URL}/users/${userId}`, { method: "DELETE" });
    await loadUsers();
    await loadAdminAuditLogs();
  } catch (error) {
    alert(error.message || "Could not delete user.");
  }
};

const handleEditUser = async (userId) => {
  const user = state.adminUsers.find((item) => item.id === userId);
  if (!user) return;

  openEditModal({
    title: "Edit user",
    submitLabel: "Update user",
    fields: [
      {
        name: "username",
        label: "Username",
        type: "text",
        value: user.username || "",
        required: true,
        minLength: 3,
        maxLength: 50,
        pattern: "[A-Za-z0-9._-]+",
        help: "Letters, numbers, dot, underscore and dash only.",
        validate: (value) => {
          const duplicate = state.adminUsers.some((item) => item.id !== user.id && String(item.username || "").trim().toLowerCase() === String(value || "").trim().toLowerCase());
          return duplicate ? "This username is already used by another account." : "";
        },
      },
      { name: "first_name", label: "First name", type: "text", value: user.first_name || "", maxLength: 80 },
      { name: "last_name", label: "Last name", type: "text", value: user.last_name || "", maxLength: 80 },
      {
        name: "email",
        label: "Email",
        type: "email",
        value: user.email || "",
        maxLength: 160,
        validate: (value) => {
          const trimmed = String(value || "").trim();
          if (!trimmed) return "";
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? "" : "Email format looks invalid.";
        },
      },
      { name: "goal", label: "Goal", type: "text", value: user.goal || "", fullWidth: true, maxLength: 200 },
    ],
    onSubmit: async (values) => {
      await apiFetch(`${API_URL}/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          username: values.username.trim(),
          first_name: String(values.first_name || "").trim(),
          last_name: String(values.last_name || "").trim(),
          email: String(values.email || "").trim(),
          goal: String(values.goal || "").trim(),
        }),
      });
      await loadUsers();
    },
  });
};

const handleAdminExerciseSubmit = async (event) => {
  event.preventDefault();

  const name = document.getElementById("exercise-name").value.trim();
  const category = document.getElementById("exercise-category").value;
  const bodyweight = document.getElementById("exercise-bodyweight").checked;

  if (!name) {
    alert("Exercise name is required.");
    return;
  }

  try {
    await apiFetch(`${API_URL}/exercises`, {
      method: "POST",
      body: JSON.stringify({ name, category, bodyweight }),
    });
    exerciseAdminForm.reset();
    document.getElementById("exercise-bodyweight").checked = true;
    await loadExerciseOptions();
    await loadAdminExercises();
  } catch (error) {
    alert(error.message);
  }
};

const handleEditAdminExercise = async (exerciseId) => {
  const exercise = state.adminExercises.find((item) => item.id === exerciseId);
  if (!exercise) return;

  openEditModal({
    title: "Edit exercise",
    submitLabel: "Update exercise",
    fields: [
      {
        name: "name",
        label: "Exercise name",
        type: "text",
        value: exercise.name || "",
        required: true,
        minLength: 2,
        maxLength: 100,
        validate: (value) => {
          const duplicate = state.adminExercises.some((item) => item.id !== exercise.id && String(item.name || "").trim().toLowerCase() === String(value || "").trim().toLowerCase());
          return duplicate ? "An exercise with this name already exists." : "";
        },
      },
      {
        name: "category",
        label: "Category",
        type: "select",
        value: exercise.category || "general",
        options: ["push", "pull", "legs", "core", "general"].map((value) => ({ value, label: value })),
      },
      { name: "bodyweight", label: "Bodyweight", type: "checkbox", value: Boolean(exercise.bodyweight), fullWidth: true },
    ],
    onSubmit: async (values) => {
      await apiFetch(`${API_URL}/exercises/${exerciseId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: values.name.trim(),
          category: values.category || "general",
          bodyweight: Boolean(values.bodyweight),
        }),
      });
      await loadExerciseOptions();
      await loadAdminExercises();
    },
  });
};

const handleEditDogExercise = async (exerciseId) => {
  const exercise = state.adminDogExercises.find((item) => item.id === exerciseId);
  if (!exercise) return;

  openEditModal({
    title: "Edit dog exercise",
    submitLabel: "Update dog exercise",
    fields: [
      {
        name: "name",
        label: "Exercise name",
        type: "text",
        value: exercise.name || "",
        required: true,
        minLength: 2,
        maxLength: 100,
        validate: (value) => {
          const duplicate = state.adminDogExercises.some((item) => item.id !== exercise.id && String(item.name || "").trim().toLowerCase() === String(value || "").trim().toLowerCase());
          return duplicate ? "A dog exercise with this name already exists." : "";
        },
      },
      {
        name: "category",
        label: "Category",
        type: "select",
        value: exercise.category || "general",
        options: ["obedience", "focus", "agility", "trick", "general"].map((value) => ({ value, label: value })),
      },
    ],
    onSubmit: async (values) => {
      await apiFetch(`${API_URL}/dog-exercises/${exerciseId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: values.name.trim(),
          category: values.category || "general",
        }),
      });
      await loadDogExerciseOptions();
    },
  });
};

const handleLogout = () => {
  clearAuth();
  state.currentView = "dashboard";
  loadRegistrationBootstrap();
};

const applyWorkoutFilter = (filter) => {
  state.workoutFilter = filter;
  document.querySelectorAll(".segment-button").forEach((button) => {
    if (button.dataset.filter) {
      button.classList.toggle("active", button.dataset.filter === filter);
    }
  });
  loadWorkouts();
};

const applyJournalFilter = (filter) => {
  state.journalFilter = filter;
  document.querySelectorAll(".journal-segment-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.journalFilter === filter);
  });
  loadJournalEntries();
};

const getEffectiveJournalCategory = () => {
  const category = state.journalCategoryFilter;
  return category && category !== "all" ? category : "Professional";
};

const applyJournalCategoryFilter = (filter) => {
  state.journalCategoryFilter = filter;
  document.querySelectorAll(".journal-category-filter-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.journalCategoryFilter === filter);
  });
  loadJournalEntries();
};

const updateExerciseState = (index, field, value) => {
  const current = state.exercises[index];
  if (!current) return;

  state.exercises[index] = {
    ...current,
    [field]: field === "bodyweight" ? Boolean(value) : value,
  };
};

const updateDogExerciseState = (index, field, value) => {
  const current = state.dogExercises[index];
  if (!current) return;

  state.dogExercises[index] = {
    ...current,
    [field]: field === "rewarded" ? Boolean(value) : value,
  };
};

form.addEventListener("submit", handleWorkoutSubmit);
addExerciseButton.addEventListener("click", addExerciseRow);
refreshButton.addEventListener("click", loadWorkouts);
if (refreshSportsButton) refreshSportsButton.addEventListener("click", loadSportsSummary);
if (refreshRaceReviewsButton) refreshRaceReviewsButton.addEventListener("click", loadRaceReviews);
if (syncSportsLatestButton) syncSportsLatestButton.addEventListener("click", () => syncSports("incremental"));
if (syncSportsFullButton) syncSportsFullButton.addEventListener("click", () => syncSports("full"));
if (sportsAiAdviceButton) sportsAiAdviceButton.addEventListener("click", loadSportsAiAdvice);
if (sportsTargetEventForm) {
  sportsTargetEventForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveSportsTargetEvent();
    } catch (error) {
      const sportsStatus = document.getElementById("sports-status");
      if (sportsStatus) sportsStatus.textContent = error.message || "Failed to save target event.";
    }
  });
}
if (sportsTargetEventClearButton) {
  sportsTargetEventClearButton.addEventListener("click", async () => {
    try {
      await clearSportsTargetEvent();
    } catch (error) {
      const sportsStatus = document.getElementById("sports-status");
      if (sportsStatus) sportsStatus.textContent = error.message || "Failed to clear target event.";
    }
  });
}
if (adminRegistrationEnabled) {
  adminRegistrationEnabled.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    await handleRegistrationToggle(target.checked);
  });
}
if (toggleWorkoutFormButton) {
  toggleWorkoutFormButton.addEventListener("click", () => {
    setWorkoutFormVisible(!state.workoutFormVisible);
  });
}
if (sportsMarathonsContainer) {
  sportsMarathonsContainer.addEventListener("submit", async (event) => {
    const formElement = event.target;
    if (!(formElement instanceof HTMLFormElement)) return;
    if (!formElement.classList.contains("sports-upload-form")) return;
    event.preventDefault();
    const activityId = formElement.dataset.marathonId;
    const fileInput = formElement.querySelector("input[type='file']");
    const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : null;
    if (!activityId || !file) return;
    const submitButton = formElement.querySelector("button[type='submit']");
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
      submitButton.textContent = "Uploading...";
    }
    try {
      await uploadSportsWorkoutFile(activityId, file);
    } catch (error) {
      const sportsStatus = document.getElementById("sports-status");
      if (sportsStatus) sportsStatus.textContent = error.message || "Failed to upload custom workout.";
    } finally {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
        submitButton.textContent = "Upload FIT/TCX/GPX";
      }
      formElement.reset();
    }
  });
}

exerciseList.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
  const index = Number(target.dataset.index);
  const field = target.dataset.field;
  if (!field || Number.isNaN(index)) return;
  updateExerciseState(index, field, target.type === "checkbox" ? target.checked : target.value);
});

exerciseList.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
  const index = Number(target.dataset.index);
  const field = target.dataset.field;
  if (field === "name" && target.tagName === "SELECT") {
    updateExerciseState(index, field, target.value);
  }
});

exerciseList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("button[data-index]");
  if (!button) return;

  const index = Number(button.dataset.index);
  if (state.exercises.length === 1) {
    state.exercises = [{ name: "", sets: "", reps: "", duration_minutes: "", bodyweight: true, notes: "" }];
  } else {
    state.exercises = state.exercises.filter((_, itemIndex) => itemIndex !== index);
  }
  renderExerciseRows();
});

if (dogExerciseList) {
  dogExerciseList.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (target.dataset.kind !== "dog") return;
    const index = Number(target.dataset.index);
    const field = target.dataset.field;
    if (!field || Number.isNaN(index)) return;
    updateDogExerciseState(index, field, target.type === "checkbox" ? target.checked : target.value);
  });

  dogExerciseList.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (target.dataset.kind !== "dog") return;
    const index = Number(target.dataset.index);
    const field = target.dataset.field;
    if (field === "name" && target.tagName === "SELECT") {
      updateDogExerciseState(index, field, target.value);
    }
  });

  dogExerciseList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button[data-kind='dog'][data-index]");
    if (!button) return;

    const index = Number(button.dataset.index);
    if (state.dogExercises.length === 1) {
      state.dogExercises = [{ name: "", reps: "", duration_minutes: "", rewarded: false, notes: "" }];
    } else {
      state.dogExercises = state.dogExercises.filter((_, itemIndex) => itemIndex !== index);
    }
    renderDogExerciseRows();
  });
}

workoutList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const editButton = target.closest("[data-edit-workout-id]");
  const deleteButton = target.closest("[data-delete-id]");
  const editId = editButton?.dataset.editWorkoutId;
  if (editId) {
    handleEditWorkout(editId);
    return;
  }
  const id = deleteButton?.dataset.deleteId;
  if (!id) return;
  handleDeleteWorkout(id);
});

if (dogWorkoutList) {
  dogWorkoutList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const editButton = target.closest("[data-edit-dog-workout-id]");
    const deleteButton = target.closest("[data-delete-dog-workout-id]");
    const editId = editButton?.dataset.editDogWorkoutId;
    if (editId) {
      handleEditDogWorkout(editId);
      return;
    }
    const id = deleteButton?.dataset.deleteDogWorkoutId;
    if (!id) return;
    handleDeleteDogWorkout(id);
  });
}

if (journalList) {
  journalList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const editButton = target.closest("[data-edit-journal-id]");
    if (editButton) {
      event.stopPropagation();
      handleStartJournalEdit(editButton.dataset.editJournalId);
      return;
    }

    const checkbox = target.closest("input[data-journal-toggle-id]");
    if (checkbox) {
      event.stopPropagation();
      handleToggleJournalReported(checkbox.dataset.journalToggleId);
      return;
    }

    const article = target.closest(".journal-item");
    if (article) {
      handleStartJournalEdit(article.dataset.journalEntryId);
    }
  });
}

if (dogList) {
  dogList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const editButton = target.closest("[data-edit-dog-id]");
    const deleteButton = target.closest("[data-delete-dog-id]");
    const editId = editButton?.dataset.editDogId;
    if (editId) {
      handleEditDog(editId);
      return;
    }
    const id = deleteButton?.dataset.deleteDogId;
    if (!id) return;
    handleDeleteDog(id);
  });
}

if (userAdminList) {
  userAdminList.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const userId = target.dataset.userId;
    const field = target.dataset.userField;
    if (!userId || !field) return;
    await handleUserAccessUpdate(userId, field, target.checked);
  });

  userAdminList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("[data-edit-user-id]");
    if (button) {
      handleEditUser(button.dataset.editUserId);
      return;
    }
    const deleteButton = target.closest("[data-delete-user-id]");
    if (!deleteButton) return;
    handleDeleteUser(deleteButton.dataset.deleteUserId);
  });
}

if (adminList) {
  adminList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("[data-edit-exercise-id]");
    if (!button) return;
    handleEditAdminExercise(button.dataset.editExerciseId);
  });
}

if (dogExerciseAdminList) {
  dogExerciseAdminList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("[data-edit-dog-exercise-id]");
    if (!button) return;
    handleEditDogExercise(button.dataset.editDogExerciseId);
  });
}

if (taskForm) taskForm.addEventListener("submit", handleTaskSubmit);
if (toggleDashboardTaskFormButton) {
  toggleDashboardTaskFormButton.addEventListener("click", () => {
    if (!taskForm) return;
    const isHidden = taskForm.classList.toggle("hidden");
    toggleDashboardTaskFormButton.setAttribute("aria-expanded", String(!isHidden));
    toggleDashboardTaskFormButton.textContent = isHidden ? "Add next action" : "Hide form";
  });
}
loginForm.addEventListener("submit", handleLogin);
registerForm.addEventListener("submit", handleRegister);
profileForm.addEventListener("submit", handleProfileUpdate);
userAdminForm.addEventListener("submit", handleUserAdminSubmit);
exerciseAdminForm.addEventListener("submit", handleAdminExerciseSubmit);
if (dogWorkoutForm) dogWorkoutForm.addEventListener("submit", handleDogWorkoutSubmit);
if (addDogExerciseButton) addDogExerciseButton.addEventListener("click", addDogExerciseRow);
if (refreshDogButton) refreshDogButton.addEventListener("click", loadDogWorkouts);
if (toggleDogWorkoutFormButton) {
  toggleDogWorkoutFormButton.addEventListener("click", () => {
    setDogWorkoutFormVisible(!state.dogWorkoutFormVisible);
  });
}
if (journalForm) journalForm.addEventListener("submit", handleJournalSubmit);
if (journalModalForm) journalModalForm.addEventListener("submit", handleJournalSubmit);
if (journalTaskForm) journalTaskForm.addEventListener("submit", handleJournalTaskSubmit);
if (journalNewEntryButton) journalNewEntryButton.addEventListener("click", () => openJournalModal());
if (refreshJournalButton) refreshJournalButton.addEventListener("click", loadJournalEntries);
if (cancelJournalEditButton) cancelJournalEditButton.addEventListener("click", () => setJournalFormMode(null));
if (journalModalCancelButton) journalModalCancelButton.addEventListener("click", closeJournalModal);
if (journalModalCloseButton) journalModalCloseButton.addEventListener("click", closeJournalModal);
if (journalModalDeleteButton) journalModalDeleteButton.addEventListener("click", () => {
  if (state.editingJournalId) {
    handleDeleteJournal(state.editingJournalId);
  }
});
if (journalModal) {
  journalModal.addEventListener("click", (event) => {
    if (event.target === journalModal) closeJournalModal();
  });
}
if (editModalForm) editModalForm.addEventListener("submit", handleEditModalSubmit);
if (editModalCancelButton) editModalCancelButton.addEventListener("click", closeEditModal);
if (editModalCloseButton) editModalCloseButton.addEventListener("click", closeEditModal);
if (editModal) {
  editModal.addEventListener("click", (event) => {
    if (event.target === editModal) closeEditModal();
  });
}
if (dogForm) dogForm.addEventListener("submit", handleDogFormSubmit);
if (dogExerciseAdminForm) dogExerciseAdminForm.addEventListener("submit", handleDogExerciseAdminSubmit);
document.getElementById("logout-button").addEventListener("click", handleLogout);
document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.currentView = button.dataset.view;
    renderView();
  });
});
document.querySelectorAll(".segment-button[data-filter]").forEach((button) => {
  button.addEventListener("click", () => applyWorkoutFilter(button.dataset.filter));
});
document.querySelectorAll(".journal-segment-button").forEach((button) => {
  button.addEventListener("click", () => applyJournalFilter(button.dataset.journalFilter));
});
document.querySelectorAll(".journal-category-filter-button").forEach((button) => {
  button.addEventListener("click", () => applyJournalCategoryFilter(button.dataset.journalCategoryFilter));
});
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const moduleButton = target.closest("[data-module-view]");
  if (moduleButton && !moduleButton.disabled) {
    state.currentView = moduleButton.dataset.moduleView;
    renderView();
    return;
  }

  const copyButton = target.closest("[data-copy-task-id]");
  if (copyButton) {
    copyTaskToClipboard(copyButton.dataset.copyTaskId);
    return;
  }

  const editTaskButton = target.closest("[data-edit-task-id]");
  if (editTaskButton) {
    handleEditTask(editTaskButton.dataset.editTaskId);
    return;
  }

  const completeTaskButton = target.closest("[data-complete-task-id]");
  if (completeTaskButton) {
    handleCompleteTask(completeTaskButton.dataset.completeTaskId);
    return;
  }

  const journalButton = target.closest("[data-journal-task-id]");
  if (journalButton) {
    copyTaskToJournal(journalButton.dataset.journalTaskId);
  }
});

if (themeToggle) {
  themeToggle.addEventListener("click", toggleTheme);
}
if (setupMfaButton) setupMfaButton.addEventListener("click", handleMfaSetup);
if (verifyMfaButton) verifyMfaButton.addEventListener("click", handleMfaVerify);
if (disableMfaButton) disableMfaButton.addEventListener("click", () => {
  if (mfaDisablePanel) {
    mfaDisablePanel.dataset.visible = "true";
    mfaDisablePanel.classList.remove("hidden");
  }
  if (mfaSetupPanel) mfaSetupPanel.classList.add("hidden");
});
if (confirmDisableMfaButton) confirmDisableMfaButton.addEventListener("click", handleMfaDisable);

setDateValue();
renderExerciseRows();
renderDogExerciseRows();
setWorkoutFormVisible(false);
setDogWorkoutFormVisible(false);
setJournalFormMode(null);
setTheme(state.theme);
updateMfaStatus();
renderView();

const initializeApp = async () => {
  await loadRegistrationBootstrap();
  if (!state.token) return;

  state.currentView = "dashboard";
  await loadProfile({ silentInvalidSession: true });
  if (!state.token) return;
  await loadTasks();
  await loadExerciseOptions();
  await loadWorkouts();
  await loadJournalEntries();
  if (state.user?.is_admin) {
    await loadUsers();
    await loadAdminExercises();
    await loadAdminRegistrationSetting();
  }
  if (state.user?.dog_training_enabled) {
    await loadDogs();
    await loadDogWorkouts();
  }
  if (state.user?.dog_training_enabled || state.user?.is_admin) {
    await loadDogExerciseOptions();
  }
  if (state.user?.sports_enabled) {
    await loadSportsSummary();
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}
