const STORAGE_KEY = "content-hub-items-v1";
const VIEW_STORAGE_KEY = "content-hub-current-view";

const STATUS = ["idea", "draft", "review", "scheduled", "posted"];
const STATUS_LABELS = {
  idea: "Idea",
  draft: "Draft",
  review: "Review",
  scheduled: "Scheduled",
  posted: "Posted",
};

const TYPE_LABELS = {
  task: "Task",
  posting: "Posting",
  meeting: "Meeting",
  deadline: "Deadline",
  campaign: "Campaign",
  note: "Note",
};

const WORK_STATES = ["todo", "in_progress", "cancelled", "finished"];
const WORK_LABELS = {
  todo: "Belum dikerjakan",
  in_progress: "Sedang dikerjakan",
  cancelled: "Batal",
  finished: "Finish",
};

const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
let items = [];
let currentView = "dashboard";
let calendarCursor = new Date();
let calendarMode = "month";
let selectedId = null;
let reminderTab = "due";
let toastTimer = null;
let editingId = null;
let serverSyncEnabled = true;
let iconRetryCount = 0;
let pendingWorkState = null;

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  restoreCurrentView();
  bindEvents();
  updateDateTime();
  window.setInterval(updateDateTime, 1000);
  showLoading("Memuat workspace", "Sebentar ya, data terbaru sedang disiapkan.");
  await loadItems();
  render();
  updateQuickAddContext();
  refreshIcons();
  finishInitialLoad();
});

window.addEventListener("load", () => {
  refreshIcons(true);
});

function cacheElements() {
  [
    "current-date",
    "current-time",
    "today-count",
    "today-tasks",
    "total-tasks",
    "week-tasks",
    "overdue-tasks",
    "posted-tasks",
    "upcoming-list",
    "dashboard-calendar",
    "status-breakdown",
    "tasks-list",
    "calendar-title",
    "calendar-subtitle",
    "calendar-grid",
    "kanban-board",
    "campaign-list",
    "notes-list",
    "notes-search",
    "global-search",
    "type-filter",
    "export-btn",
    "quick-add",
    "loading-overlay",
    "loading-title",
    "loading-copy",
    "app-toast",
    "toast-message",
    "quick-modal",
    "quick-form",
    "detail-modal",
    "detail-type",
    "detail-title",
    "detail-body",
    "detail-close",
    "detail-status-select",
    "save-detail",
    "delete-item",
    "edit-item",
    "reminder-dot",
    "reminder-btn",
    "reminder-modal",
    "reminder-close",
    "reminder-list",
    "reminder-subtitle",
    "day-modal",
    "day-modal-title",
    "day-modal-subtitle",
    "day-items-list",
    "day-close",
    "campaign-detail-modal",
    "campaign-detail-title",
    "campaign-detail-subtitle",
    "campaign-detail-body",
    "campaign-detail-close",
  ].forEach((id) => {
    els[toCamel(id)] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelectorAll("[data-jump-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.jumpView));
  });

  document.querySelectorAll("[data-calendar-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      calendarMode = button.dataset.calendarMode;
      document.querySelectorAll("[data-calendar-mode]").forEach((modeButton) => modeButton.classList.toggle("active", modeButton === button));
      renderCalendar();
    });
  });

  document.getElementById("prev-period").addEventListener("click", () => {
    if (calendarMode === "month") {
      calendarCursor.setMonth(calendarCursor.getMonth() - 1);
    } else {
      calendarCursor.setDate(calendarCursor.getDate() - 7);
    }
    renderCalendar();
  });

  document.getElementById("next-period").addEventListener("click", () => {
    if (calendarMode === "month") {
      calendarCursor.setMonth(calendarCursor.getMonth() + 1);
    } else {
      calendarCursor.setDate(calendarCursor.getDate() + 7);
    }
    renderCalendar();
  });

  els.quickAdd.addEventListener("click", openQuickModal);
  document.querySelectorAll(".close-modal").forEach((button) => button.addEventListener("click", closeQuickModal));
  els.quickModal.addEventListener("click", (event) => {
    if (event.target === els.quickModal) closeQuickModal();
  });

  els.detailClose.addEventListener("click", closeDetailModal);
  els.detailModal.addEventListener("click", (event) => {
    if (event.target === els.detailModal) closeDetailModal();
  });
  els.dayClose.addEventListener("click", closeDayModal);
  els.dayModal.addEventListener("click", (event) => {
    if (event.target === els.dayModal) closeDayModal();
  });
  els.reminderBtn.addEventListener("click", openReminderModal);
  els.reminderClose.addEventListener("click", closeReminderModal);
  els.reminderModal.addEventListener("click", (event) => {
    if (event.target === els.reminderModal) closeReminderModal();
  });
  document.querySelectorAll("[data-reminder-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      reminderTab = button.dataset.reminderTab;
      renderReminderModal();
    });
  });

  els.quickForm.addEventListener("submit", handleCreateItem);
  els.saveDetail.addEventListener("click", saveDetailStatus);
  els.deleteItem.addEventListener("click", deleteSelectedItem);
  els.editItem.addEventListener("click", editSelectedItem);
  els.detailBody.addEventListener("click", handleDetailBodyClick);
  els.notesSearch.addEventListener("input", renderNotes);
  els.globalSearch.addEventListener("input", render);
  els.typeFilter.addEventListener("change", render);
  els.exportBtn.addEventListener("click", exportBackup);
  document.getElementById("item-type").addEventListener("change", updateQuickFormMode);
  document.getElementById("item-meeting-format").addEventListener("change", updateQuickFormMode);
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  els.campaignDetailClose.addEventListener("click", closeCampaignDetailModal);
  els.campaignDetailModal.addEventListener("click", (event) => {
    if (event.target === els.campaignDetailModal) closeCampaignDetailModal();
  });
  window.addEventListener("storage", handleStorageSync);
}

async function loadItems() {
  try {
    const remoteItems = await apiRequest("/api/items");
    const localItems = readLocalItems();
    items = remoteItems.items.map(normalizeItem);
    if (!items.length && localItems.length) {
      items = localItems;
      await Promise.all(items.map((item) => saveItem(item)));
      showToast("Data lokal berhasil disinkronkan ke database");
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return;
  } catch {
    serverSyncEnabled = false;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      items = JSON.parse(raw).map(normalizeItem);
    } catch {
      items = [];
    }
    return;
  }

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, 6);
  items = [
    {
      id: crypto.randomUUID(),
      type: "task",
      title: "Checklist asset feed promo",
      description: "Pastikan visual, copy, dan link promo sudah final sebelum masuk schedule.",
      platform: "",
      pic: "Alya",
      date: toDateInput(today),
      time: "09:00",
      campaign: "Awareness Mei",
      reminder: "2",
      status: "draft",
      workState: "todo",
      caption: "",
      hashtags: "",
      asset: "",
    },
    {
      id: crypto.randomUUID(),
      type: "posting",
      title: "Reels edukasi campaign Mei",
      description: "Angle konten: tips singkat untuk memperkenalkan pain point audience.",
      platform: "Instagram",
      pic: "Alya",
      date: toDateInput(today),
      time: "10:00",
      campaign: "Awareness Mei",
      reminder: "2",
      status: "scheduled",
      workState: "in_progress",
      caption: "3 hal yang sering bikin konten brand terasa datar.",
      hashtags: "#contentstrategy, #socialmedia",
      asset: "",
    },
    {
      id: crypto.randomUUID(),
      type: "meeting",
      title: "Weekly content sync",
      description: "Review progress draft, approval asset, dan kebutuhan shooting.",
      platform: "",
      pic: "Team",
      date: toDateInput(tomorrow),
      time: "14:00",
      campaign: "Awareness Mei",
      reminder: "24",
      status: "review",
      workState: "todo",
      meetingFormat: "online",
      meetingLink: "https://meet.google.com/",
      meetingLocation: "",
      caption: "",
      hashtags: "",
      asset: "",
    },
    {
      id: crypto.randomUUID(),
      type: "deadline",
      title: "Submit caption batch TikTok",
      description: "Final caption untuk 5 video pendek sebelum masuk review.",
      platform: "TikTok",
      pic: "Raka",
      date: toDateInput(nextWeek),
      time: "17:00",
      campaign: "Launch Produk",
      reminder: "6",
      status: "draft",
      workState: "todo",
      caption: "",
      hashtags: "#launch",
      asset: "",
    },
  ];
  persist();
}

function readLocalItems() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw).map(normalizeItem);
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

async function saveItem(item) {
  persist();
  if (!serverSyncEnabled) return;
  await apiRequest("/api/items", {
    method: "POST",
    body: JSON.stringify({ item }),
  }).catch(() => {
    serverSyncEnabled = false;
    showToast("Tersimpan lokal. Database belum tersambung.");
  });
}

async function removeItem(id) {
  persist();
  if (!serverSyncEnabled) return;
  await apiRequest("/api/items", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  }).catch(() => {
    serverSyncEnabled = false;
    showToast("Dihapus lokal. Database belum tersambung.");
  });
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error("API request failed");
  return response.json();
}

function refreshFromState() {
  render();
}

function render() {
  updateDateTime();

  renderStats();
  renderTodayTasks();
  renderDashboardCalendar();
  renderCalendar();
  renderUpcoming();
  renderStatusBreakdown();
  renderTasks();
  renderKanban();
  renderCampaigns();
  renderNotes();
  renderAnalytics();
  refreshIcons();
}

function updateDateTime() {
  const now = new Date();
  els.currentDate.textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  els.currentTime.textContent = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
}

function renderStats() {
  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);
  const source = getVisibleItems();
  const taskItems = source.filter(isTaskLike);
  const weekItems = taskItems.filter((item) => item.date && parseDate(item.date) >= today && parseDate(item.date) <= weekEnd);
  const overdue = taskItems.filter((item) => item.date && parseDate(item.date) < today && item.workState !== "finished" && item.workState !== "cancelled");
  const posted = source.filter((item) => isContentLike(item) && item.status === "posted");

  els.totalTasks.textContent = taskItems.length;
  els.weekTasks.textContent = weekItems.length;
  els.overdueTasks.textContent = overdue.length;
  els.postedTasks.textContent = posted.length;

  const reminders = items.filter((item) => isReminderDue(item));
  els.reminderDot.classList.toggle("active", reminders.length > 0);
}

function renderTodayTasks() {
  const today = toDateInput(new Date());
  const todayItems = getVisibleItems().filter((item) => item.date === today && isTaskLike(item)).sort(byTime);
  els.todayCount.textContent = todayItems.length;
  els.todayTasks.innerHTML = todayItems.length ? todayItems.map(compactCard).join("") : emptyState("Belum ada task hari ini.");
  bindItemButtons(els.todayTasks);
}

function renderDashboardCalendar() {
  els.dashboardCalendar.innerHTML = buildCalendarCells(calendarCursor, "mini").join("");
  bindCalendarDays(els.dashboardCalendar);
}

function renderCalendar() {
  if (calendarMode === "week") {
    renderWeekCalendar();
    return;
  }

  els.calendarTitle.textContent = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(calendarCursor);
  els.calendarSubtitle.textContent = "Monthly content schedule";
  els.calendarGrid.innerHTML = buildCalendarCells(calendarCursor, "full").join("");
  bindCalendarDays(els.calendarGrid);
}

function renderWeekCalendar() {
  const weekStart = startOfWeek(calendarCursor);
  const weekEnd = addDays(weekStart, 6);
  els.calendarTitle.textContent = `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;
  els.calendarSubtitle.textContent = "Weekly content schedule";

  const cells = [...dayNames.map((day) => `<div class="day-name">${day}</div>`)];
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index);
    cells.push(calendarCell(date, false, "full"));
  }
  els.calendarGrid.innerHTML = cells.join("");
  bindCalendarDays(els.calendarGrid);
}

function buildCalendarCells(cursor, size) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const firstGridDate = addDays(first, -first.getDay());
  const cells = [...dayNames.map((day) => `<div class="day-name">${day}</div>`)];

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(firstGridDate, index);
    cells.push(calendarCell(date, date.getMonth() !== month, size));
  }

  return cells;
}

function calendarCell(date, muted, size) {
  const dateKey = toDateInput(date);
  const dayItems = getVisibleItems().filter((item) => item.date === dateKey && isCalendarItem(item)).sort(byTime);
  const today = dateKey === toDateInput(new Date());
  const hasTask = dayItems.some(isTaskLike);
  const hasContent = dayItems.some(isContentLike);
  const markers = [
    hasTask ? '<span class="calendar-marker task-marker" title="Task"></span>' : "",
    hasContent ? '<span class="calendar-marker content-marker" title="Content Plan"></span>' : "",
  ].join("");
  const visibleItems = size === "mini" ? dayItems.slice(0, 2) : dayItems.slice(0, 4);
  const more = dayItems.length - visibleItems.length;

  return `
    <button class="calendar-cell ${muted ? "muted" : ""} ${today ? "today" : ""} ${dayItems.length ? "has-items" : ""} ${hasTask ? "has-task" : ""} ${hasContent ? "has-content" : ""}" data-date="${dateKey}" type="button">
      <div class="cell-date">
        <span>${date.getDate()}</span>
        <span class="cell-markers">${markers || (dayItems.length ? `<span class="type-badge">${dayItems.length}</span>` : "")}</span>
      </div>
      <div class="cell-items">
        ${visibleItems.map((item) => `<span class="calendar-pill ${item.type}">${escapeHtml(item.title)}</span>`).join("")}
        ${more > 0 ? `<span class="calendar-pill note">+${more} lagi</span>` : ""}
      </div>
    </button>
  `;
}

function renderUpcoming() {
  const today = startOfDay(new Date());
  const upcomingItems = getVisibleItems()
    .filter((item) => item.date && parseDate(item.date) >= today)
    .sort(byTime)
    .slice(0, 6);

  els.upcomingList.innerHTML = upcomingItems.length ? upcomingItems.map(itemCard).join("") : emptyState("Belum ada jadwal terdekat.");
  bindItemButtons(els.upcomingList);
}

function renderStatusBreakdown() {
  els.statusBreakdown.innerHTML = STATUS.map((status) => {
    const count = getVisibleItems().filter((item) => isContentLike(item) && item.status === status).length;
    return `
      <div class="status-summary">
        <span class="status-pill status-${status}">${STATUS_LABELS[status]}</span>
        <strong>${count}</strong>
      </div>
    `;
  }).join("");
}

function renderTasks() {
  const taskItems = getVisibleItems().filter(isTaskLike).sort(byWorkThenTime);
  els.tasksList.innerHTML = taskItems.length ? taskItems.map(itemCard).join("") : emptyState("Belum ada task. Klik tombol plus untuk menambahkan.");
  bindItemButtons(els.tasksList);
}

function renderKanban() {
  els.kanbanBoard.innerHTML = STATUS.map((status) => {
    const statusItems = getVisibleItems().filter((item) => item.status === status && isContentLike(item));
    return `
      <section class="kanban-column">
        <div class="kanban-title">
          <span>${STATUS_LABELS[status]}</span>
          <span>${statusItems.length}</span>
        </div>
        ${statusItems.length ? statusItems.map(itemCard).join("") : emptyState("Kosong")}
      </section>
    `;
  }).join("");
  bindItemButtons(els.kanbanBoard);
}

function renderCampaigns() {
  const groups = getVisibleItems().reduce((acc, item) => {
    if (!isCalendarItem(item)) return acc;
    const campaign = item.campaign?.trim();
    if (!campaign) return acc;
    acc[campaign] ||= [];
    acc[campaign].push(item);
    return acc;
  }, {});

  const names = Object.keys(groups).sort();
  els.campaignList.innerHTML = names.length
    ? names.map((name) => {
        const group = groups[name];
        const done = group.filter((item) => item.status === "posted").length;
        const progress = Math.round((done / group.length) * 100);
        const dates = group.map((item) => item.date).filter(Boolean).sort();
        return `
          <button class="campaign-card" data-campaign="${escapeAttribute(name)}">
            <div>
              <h3>${escapeHtml(name)}</h3>
              <p>${group.length} item terkait ${dates.length ? `- ${formatShortDate(parseDate(dates[0]))} sampai ${formatShortDate(parseDate(dates[dates.length - 1]))}` : ""}</p>
            </div>
            <div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div>
            <div class="item-meta">
              <span class="status-pill status-posted">${done}/${group.length} posted</span>
              <span class="status-pill status-review">${progress}% progress</span>
            </div>
          </button>
        `;
      }).join("")
    : emptyState("Belum ada campaign. Isi field Campaign / Brand saat quick capture.");
  document.querySelectorAll("[data-campaign]").forEach((button) => {
    button.addEventListener("click", () => openCampaignDetail(button.dataset.campaign));
  });
}

function renderNotes() {
  const query = els.notesSearch.value.trim().toLowerCase();
  const noteItems = getVisibleItems()
    .filter((item) => item.type === "note")
    .filter((item) => !query || `${item.title} ${item.description} ${item.campaign}`.toLowerCase().includes(query))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  els.notesList.innerHTML = noteItems.length
    ? noteItems.map((item) => `
      <button class="note-card item-card" data-item-id="${item.id}">
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${formatNoteDate(item)}${item.campaign ? ` - ${escapeHtml(item.campaign)}` : ""}</p>
        </div>
        <div class="note-content">${escapeHtml(item.description || "Tidak ada catatan tambahan.")}</div>
      </button>
    `).join("")
    : emptyState("Belum ada catatan. Klik tombol plus lalu pilih jenis Note.");
  bindItemButtons(els.notesList);
}

function renderAnalytics() {
  const source = getVisibleItems();
  const platforms = countBy(source, "platform");
  const campaigns = countBy(source, "campaign");
  const mostUsedPlatform = topEntry(platforms);
  const topCampaign = topEntry(campaigns);
  const posted = source.filter((item) => item.status === "posted").length;
  const scheduled = source.filter((item) => item.status === "scheduled").length;

  els.analyticsGrid.innerHTML = [
    analyticsCard("Posted Content", posted, "Konten yang sudah selesai dipublish."),
    analyticsCard("Scheduled", scheduled, "Konten yang sudah masuk jadwal."),
    analyticsCard("Top Platform", mostUsedPlatform?.[0] || "-", mostUsedPlatform ? `${mostUsedPlatform[1]} item` : "Belum ada data."),
    analyticsCard("Top Campaign", topCampaign?.[0] || "-", topCampaign ? `${topCampaign[1]} item` : "Belum ada data."),
  ].join("");
}

function analyticsCard(title, value, copy) {
  return `
    <article class="analytics-card">
      <p>${title}</p>
      <h3>${escapeHtml(String(value))}</h3>
      <p>${copy}</p>
    </article>
  `;
}

function compactCard(item) {
  return `
    <button class="item-card" data-item-id="${item.id}">
      <span class="item-title">${escapeHtml(item.title)}</span>
      <span class="item-meta">${item.time || "All day"} <span class="status-pill status-${item.status}">${STATUS_LABELS[item.status]}</span></span>
    </button>
  `;
}

function itemCard(item) {
  return `
    <button class="item-card work-${item.workState}" data-item-id="${item.id}">
      <span class="item-title">${escapeHtml(item.title)}</span>
      <span class="item-meta">
        <span class="type-badge ${item.type}">${TYPE_LABELS[item.type]}</span>
        <span class="work-pill work-${item.workState}">${WORK_LABELS[item.workState]}</span>
        <span>${getCardContext(item)}</span>
      </span>
      <span class="item-meta">${formatDateTime(item)}${item.pic ? ` - PIC: ${escapeHtml(item.pic)}` : ""}</span>
    </button>
  `;
}

function bindItemButtons(root) {
  root.querySelectorAll("[data-item-id]").forEach((button) => {
    button.addEventListener("click", () => openDetailModal(button.dataset.itemId));
  });
}

function bindCalendarDays(root) {
  root.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => openDayModal(button.dataset.date));
  });
}

async function handleCreateItem(event) {
  event.preventDefault();
  const type = getValue("item-type");
  const item = {
    id: crypto.randomUUID(),
    type,
    status: isContentFormType(type) ? getValue("item-status") : "idea",
    title: getValue("item-title").trim(),
    description: getValue("item-description").trim(),
    platform: type === "posting" ? getValue("item-platform") : "",
    pic: getValue("item-pic").trim(),
    date: type === "note" ? "" : getValue("item-date") || toDateInput(new Date()),
    time: type === "note" ? "" : getValue("item-time"),
    campaign: getValue("item-campaign").trim(),
    reminder: getValue("item-reminder"),
    caption: isContentFormType(type) ? getValue("item-caption").trim() : "",
    hashtags: isContentFormType(type) ? getValue("item-hashtags").trim() : "",
    asset: isContentFormType(type) ? getValue("item-asset").trim() : "",
    meetingFormat: type === "meeting" ? getValue("item-meeting-format") : "",
    meetingLink: type === "meeting" && getValue("item-meeting-format") === "online" ? getValue("item-meeting-link").trim() : "",
    meetingLocation: type === "meeting" && getValue("item-meeting-format") === "offline" ? getValue("item-meeting-location").trim() : "",
    workState: "todo",
    createdAt: new Date().toISOString(),
  };

  if (!item.title) return;
  if (item.type === "note") item.status = "idea";

  showLoading("Menyimpan", "Item baru sedang ditambahkan.");
  try {
    await waitForSmoothFeedback();
    if (editingId) {
      item.id = editingId;
      const existing = items.find((entry) => entry.id === editingId);
      item.createdAt = existing?.createdAt || item.createdAt;
      items = items.map((entry) => (entry.id === editingId ? item : entry));
    } else {
      items.unshift(item);
    }
    if (isCalendarItem(item)) calendarCursor = parseDate(item.date);
    await saveItem(item);
    closeQuickModal();
    refreshFromState();
    switchView(item.type === "note" ? "notes" : "calendar");
    showToast(editingId ? "Perubahan berhasil disimpan" : "Berhasil disimpan");
    editingId = null;
  } finally {
    hideLoading();
  }
}

function openQuickModal() {
  els.quickForm.reset();
  const contextualType = getQuickAddTypeForView(currentView);
  document.getElementById("item-type").value = contextualType;
  document.getElementById("item-date").value = toDateInput(new Date());
  updateQuickFormMode();
  els.quickModal.classList.remove("hidden");
  document.getElementById("item-title").focus();
}

function closeQuickModal() {
  els.quickModal.classList.add("hidden");
  els.quickForm.classList.remove("note-mode", "task-mode", "posting-mode", "meeting-mode", "deadline-mode", "campaign-mode");
  editingId = null;
}

function updateQuickFormMode() {
  const type = getValue("item-type");
  const isNote = type === "note";
  const meetingFormat = getValue("item-meeting-format");
  els.quickForm.classList.remove("note-mode", "task-mode", "posting-mode", "meeting-mode", "deadline-mode", "campaign-mode", "meeting-online", "meeting-offline");
  els.quickForm.classList.add(`${type}-mode`);
  if (type === "meeting") els.quickForm.classList.add(meetingFormat === "offline" ? "meeting-offline" : "meeting-online");
  els.quickForm.classList.toggle("note-mode", isNote);
  document.getElementById("item-title").placeholder = getTitlePlaceholder(type);
  document.getElementById("item-description").placeholder = isNote
    ? "Tulis catatan bebas di sini"
    : type === "meeting"
      ? "Agenda, keputusan, follow up, atau konteks meeting"
      : "Brief, angle konten, detail tugas, atau catatan penting";
}

async function logout() {
  showLoading("Logout", "Mengakhiri sesi kamu.");
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/login.html";
}

function editSelectedItem() {
  const item = items.find((entry) => entry.id === selectedId);
  if (!item) return;
  editingId = item.id;
  closeDetailModal();
  fillQuickForm(item);
  updateQuickFormMode();
  els.quickModal.classList.remove("hidden");
  document.getElementById("item-title").focus();
}

function fillQuickForm(item) {
  document.getElementById("item-type").value = item.type;
  document.getElementById("item-status").value = item.status;
  document.getElementById("item-title").value = item.title;
  document.getElementById("item-description").value = item.description;
  document.getElementById("item-platform").value = item.platform;
  document.getElementById("item-pic").value = item.pic;
  document.getElementById("item-date").value = item.date || toDateInput(new Date());
  document.getElementById("item-time").value = item.time;
  document.getElementById("item-campaign").value = item.campaign;
  document.getElementById("item-reminder").value = item.reminder;
  document.getElementById("item-caption").value = item.caption;
  document.getElementById("item-hashtags").value = item.hashtags;
  document.getElementById("item-asset").value = item.asset;
  document.getElementById("item-meeting-format").value = item.meetingFormat || "online";
  document.getElementById("item-meeting-link").value = item.meetingLink;
  document.getElementById("item-meeting-location").value = item.meetingLocation;
}

function openDetailModal(id) {
  selectedId = id;
  const item = items.find((entry) => entry.id === id);
  if (!item) return;

  closeDayModal();
  els.detailType.textContent = TYPE_LABELS[item.type] || item.type;
  els.detailTitle.textContent = item.title;
  els.detailStatusSelect.value = item.status;
  pendingWorkState = item.workState;
  els.detailStatusSelect.hidden = !isContentLike(item);
  els.saveDetail.hidden = false;
  els.detailBody.innerHTML = `
    <div class="detail-summary">
      ${summaryChip("calendar", item.type === "note" ? formatNoteDate(item) : formatDateTime(item))}
      ${summaryChip("circle-dot", STATUS_LABELS[item.status], `status-${item.status}`)}
      ${summaryChip("list-checks", WORK_LABELS[item.workState], `work-${item.workState}`)}
      ${summaryChip("user", item.pic || "Belum ada PIC")}
      ${summaryChip("monitor-play", getCardContext(item))}
    </div>

    ${isCalendarItem(item) ? `
      <section class="detail-section wide">
        <div class="detail-section-title">
          <i data-lucide="list-checks"></i>
          <h3>Status Pengerjaan</h3>
        </div>
        <div class="work-actions">
          ${WORK_STATES.map((state) => `
            <button type="button" class="work-action work-${state} ${item.workState === state ? "active" : ""}" data-work-state="${state}" aria-pressed="${item.workState === state}">
              ${WORK_LABELS[state]}
            </button>
          `).join("")}
        </div>
      </section>
    ` : ""}

    <section class="detail-section wide">
      <div class="detail-section-title">
        <i data-lucide="align-left"></i>
        <h3>Deskripsi</h3>
      </div>
      <div class="detail-text">${escapeHtml(item.description || "Belum ada deskripsi.")}</div>
    </section>

    ${item.type === "meeting" ? `
      <section class="detail-section">
        <div class="detail-section-title">
          <i data-lucide="video"></i>
          <h3>Format Meeting</h3>
        </div>
        <div class="detail-value">${item.meetingFormat === "offline" ? "Offline" : "Online"}</div>
      </section>

      <section class="detail-section">
        <div class="detail-section-title">
          <i data-lucide="${item.meetingFormat === "offline" ? "map-pin" : "link"}"></i>
          <h3>${item.meetingFormat === "offline" ? "Lokasi" : "Link Meeting"}</h3>
        </div>
        <div class="detail-value">${formatMeetingAccess(item)}</div>
      </section>
    ` : ""}

    ${item.campaign ? `<section class="detail-section">
      <div class="detail-section-title">
        <i data-lucide="target"></i>
        <h3>Campaign</h3>
      </div>
      <div class="detail-value">${escapeHtml(item.campaign || "-")}</div>
    </section>` : ""}

    <section class="detail-section">
      <div class="detail-section-title">
        <i data-lucide="bell"></i>
        <h3>Reminder</h3>
      </div>
      <div class="detail-value">${item.reminder ? `${item.reminder} jam sebelum deadline` : "-"}</div>
    </section>

    ${isContentLike(item) ? `<section class="detail-section wide">
      <div class="detail-section-title">
        <i data-lucide="message-square-text"></i>
        <h3>Caption</h3>
      </div>
      <div class="detail-text">${escapeHtml(item.caption || "-")}</div>
    </section>

    <section class="detail-section">
      <div class="detail-section-title">
        <i data-lucide="hash"></i>
        <h3>Hashtag</h3>
      </div>
      <div class="detail-value">${escapeHtml(item.hashtags || "-")}</div>
    </section>

    <section class="detail-section">
      <div class="detail-section-title">
        <i data-lucide="link"></i>
        <h3>Asset</h3>
      </div>
      <div class="detail-value">${item.asset ? `<a href="${escapeAttribute(item.asset)}" target="_blank" rel="noreferrer">${escapeHtml(item.asset)}</a>` : "-"}</div>
    </section>` : ""}
  `;
  els.detailModal.classList.remove("hidden");
  refreshIcons();
}

function handleDetailBodyClick(event) {
  const button = event.target.closest("[data-work-state]");
  if (!button) return;
  pendingWorkState = button.dataset.workState;
  els.detailBody.querySelectorAll("[data-work-state]").forEach((statusButton) => {
    const isActive = statusButton.dataset.workState === pendingWorkState;
    statusButton.classList.toggle("active", isActive);
    statusButton.setAttribute("aria-pressed", String(isActive));
  });
}

function detailRow(label, value, wide = false) {
  return `
    <div class="detail-row ${wide ? "wide" : ""}">
      <div class="detail-label">${label}</div>
      <div class="detail-value">${value}</div>
    </div>
  `;
}

function summaryChip(icon, value, extraClass = "") {
  return `
    <div class="summary-chip ${extraClass}">
      <i data-lucide="${icon}"></i>
      <span>${escapeHtml(value)}</span>
    </div>
  `;
}

function closeDetailModal() {
  selectedId = null;
  pendingWorkState = null;
  els.detailModal.classList.add("hidden");
}

function openReminderModal() {
  reminderTab = "due";
  els.reminderModal.classList.remove("hidden");
  renderReminderModal();
}

function closeReminderModal() {
  els.reminderModal.classList.add("hidden");
}

function renderReminderModal() {
  document.querySelectorAll("[data-reminder-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.reminderTab === reminderTab);
  });

  const reminderItems = getReminderItems();
  const subtitleMap = {
    due: "Item yang reminder-nya sudah masuk waktu cek.",
    overdue: "Task dan jadwal yang sudah lewat tapi belum selesai.",
    today: "Semua jadwal yang jatuh pada hari ini.",
    upcoming: "Jadwal terdekat dalam 7 hari ke depan.",
  };
  els.reminderSubtitle.textContent = subtitleMap[reminderTab] || subtitleMap.due;
  els.reminderList.innerHTML = reminderItems.length
    ? reminderItems.map(reminderCard).join("")
    : emptyState("Belum ada item pada kategori ini.");
  bindItemButtons(els.reminderList);
  refreshIcons();
}

function getDueReminderItems() {
  return items.filter(isReminderDue).sort(byTime);
}

function getReminderItems() {
  if (reminderTab === "due") return getDueReminderItems();
  const today = startOfDay(new Date());
  if (reminderTab === "overdue") {
    return items
      .filter((item) => isCalendarItem(item) && parseDate(item.date) < today && item.workState !== "finished" && item.workState !== "cancelled")
      .sort(byTime);
  }
  if (reminderTab === "today") {
    const key = toDateInput(today);
    return items.filter((item) => isCalendarItem(item) && item.date === key).sort(byWorkThenTime);
  }
  return getUpcomingReminderItems();
}

function getUpcomingReminderItems() {
  const today = startOfDay(new Date());
  const nextWeek = addDays(today, 7);
  return items
    .filter((item) => isCalendarItem(item) && parseDate(item.date) >= today && parseDate(item.date) <= nextWeek && item.status !== "posted")
    .sort(byTime)
    .slice(0, 10);
}

function reminderCard(item) {
  return `
    <button class="item-card reminder-item" data-item-id="${item.id}">
      <span class="item-title">${escapeHtml(item.title)}</span>
      <span class="item-meta">
        <span class="type-badge ${item.type}">${TYPE_LABELS[item.type]}</span>
        <span class="status-pill status-${item.status}">${STATUS_LABELS[item.status]}</span>
      </span>
      <span class="item-meta">${formatDateTime(item)}${item.reminder ? ` - reminder ${item.reminder} jam sebelumnya` : ""}</span>
    </button>
  `;
}

function openDayModal(dateKey) {
  const dayItems = items.filter((item) => item.date === dateKey && isCalendarItem(item)).sort(byWorkThenTime);
  const date = parseDate(dateKey);
  els.dayModalTitle.textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  els.dayModalSubtitle.textContent = dayItems.length ? `${dayItems.length} item pada tanggal ini` : "Belum ada item pada tanggal ini";
  els.dayItemsList.innerHTML = dayItems.length ? dayItems.map(itemCard).join("") : emptyState("Tanggal ini masih kosong.");
  bindItemButtons(els.dayItemsList);
  els.dayModal.classList.remove("hidden");
  refreshIcons();
}

function closeDayModal() {
  els.dayModal.classList.add("hidden");
}

function openCampaignDetail(name) {
  const campaignItems = items.filter((item) => item.campaign === name).sort(byWorkThenTime);
  const done = campaignItems.filter((item) => item.status === "posted" || item.workState === "finished").length;
  const progress = campaignItems.length ? Math.round((done / campaignItems.length) * 100) : 0;
  const dates = campaignItems.map((item) => item.date).filter(Boolean).sort();

  els.campaignDetailTitle.textContent = name;
  els.campaignDetailSubtitle.textContent = campaignItems.length
    ? `${campaignItems.length} item terkait - progress ${progress}%`
    : "Belum ada item terkait";
  els.campaignDetailBody.innerHTML = `
    <div class="campaign-detail-summary">
      <div class="analytics-card"><p>Total Item</p><h3>${campaignItems.length}</h3><p>Semua task dan konten terkait.</p></div>
      <div class="analytics-card"><p>Progress</p><h3>${progress}%</h3><p>${done}/${campaignItems.length || 0} selesai atau posted.</p></div>
      <div class="analytics-card"><p>Timeline</p><h3>${dates.length ? formatShortDate(parseDate(dates[0])) : "-"}</h3><p>${dates.length ? `sampai ${formatShortDate(parseDate(dates[dates.length - 1]))}` : "Belum ada tanggal."}</p></div>
    </div>
    <div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div>
    <div class="task-list">${campaignItems.length ? campaignItems.map(itemCard).join("") : emptyState("Campaign ini belum punya item.")}</div>
  `;
  bindItemButtons(els.campaignDetailBody);
  els.campaignDetailModal.classList.remove("hidden");
  refreshIcons();
}

function closeCampaignDetailModal() {
  els.campaignDetailModal.classList.add("hidden");
}

async function saveDetailStatus() {
  const item = items.find((entry) => entry.id === selectedId);
  if (!item) return;
  showLoading("Menyimpan", "Perubahan status sedang disimpan.");
  try {
    await waitForSmoothFeedback();
    if (isContentLike(item)) item.status = els.detailStatusSelect.value;
    if (pendingWorkState) item.workState = pendingWorkState;
    await saveItem(item);
    closeDetailModal();
    refreshFromState();
    showToast("Perubahan status berhasil disimpan");
  } finally {
    hideLoading();
  }
}

async function deleteSelectedItem() {
  if (!selectedId) return;
  showLoading("Menghapus", "Item sedang dihapus.");
  try {
    await waitForSmoothFeedback();
    const deletedId = selectedId;
    items = items.filter((item) => item.id !== selectedId);
    await removeItem(deletedId);
    closeDetailModal();
    refreshFromState();
    showToast("Item berhasil dihapus");
  } finally {
    hideLoading();
  }
}

function switchView(view) {
  currentView = view;
  localStorage.setItem(VIEW_STORAGE_KEY, view);
  document.querySelectorAll(".nav-btn").forEach((button) => {
    const isActive = button.dataset.view === view;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `${view}-view`));
  updateQuickAddContext();
  refreshIcons();
}

function restoreCurrentView() {
  const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
  if (!savedView || !document.getElementById(`${savedView}-view`)) return;
  currentView = savedView;
  document.querySelectorAll(".nav-btn").forEach((button) => {
    const isActive = button.dataset.view === savedView;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${savedView}-view`);
  });
  updateQuickAddContext();
}

function getQuickAddTypeForView(view) {
  const map = {
    tasks: "task",
    planner: "posting",
    notes: "note",
    campaign: "campaign",
    calendar: "task",
  };
  return map[view] || "task";
}

function updateQuickAddContext() {
  const labelMap = {
    dashboard: "Quick add",
    calendar: "Tambah jadwal",
    tasks: "Tambah task",
    planner: "Tambah konten",
    campaign: "Tambah campaign",
    notes: "Tambah catatan",
    analytics: "Tambah item",
  };
  const iconMap = {
    dashboard: "plus",
    calendar: "calendar-plus",
    tasks: "list-plus",
    planner: "file-plus-2",
    campaign: "target",
    notes: "file-plus",
    analytics: "plus",
  };
  els.quickAdd.title = labelMap[currentView] || "Quick add";
  els.quickAdd.setAttribute("aria-label", labelMap[currentView] || "Quick add");
  els.quickAdd.innerHTML = `<i data-lucide="${iconMap[currentView] || "plus"}"></i>`;
  refreshIcons();
}

function isTaskLike(item) {
  return item.type === "task" || item.type === "deadline";
}

function isContentLike(item) {
  return item.type === "posting" || item.type === "campaign";
}

function isCalendarItem(item) {
  return item.type !== "note" && Boolean(item.date);
}

function isContentFormType(type) {
  return type === "posting" || type === "campaign";
}

function getVisibleItems() {
  const query = els.globalSearch?.value.trim().toLowerCase() || "";
  const type = els.typeFilter?.value || "all";
  return items.filter((item) => {
    const matchesType = type === "all" || item.type === type;
    const haystack = [
      item.title,
      item.description,
      item.platform,
      item.pic,
      item.campaign,
      item.caption,
      item.hashtags,
      item.meetingLink,
      item.meetingLocation,
      TYPE_LABELS[item.type],
      STATUS_LABELS[item.status],
      WORK_LABELS[item.workState],
    ].join(" ").toLowerCase();
    return matchesType && (!query || haystack.includes(query));
  });
}

function exportBackup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    total: items.length,
    items,
  };
  downloadFile(`content-hub-backup-${toDateInput(new Date())}.json`, JSON.stringify(payload, null, 2), "application/json");
  showToast("Backup JSON berhasil dibuat");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getCardContext(item) {
  if (item.type === "meeting") return item.meetingFormat === "offline" ? item.meetingLocation || "Offline" : item.meetingLink || "Online";
  return item.platform || item.campaign || "General";
}

function getTitlePlaceholder(type) {
  const placeholders = {
    task: "Contoh: Follow up asset campaign",
    posting: "Contoh: Reels launch campaign Mei",
    meeting: "Contoh: Weekly content sync",
    deadline: "Contoh: Deadline revisi caption",
    campaign: "Contoh: Campaign Awareness Mei",
    note: "Contoh: Insight meeting client",
  };
  return placeholders[type] || placeholders.task;
}

function formatMeetingAccess(item) {
  if (item.meetingFormat === "offline") return escapeHtml(item.meetingLocation || "-");
  if (!item.meetingLink) return "-";
  return `<a href="${escapeAttribute(item.meetingLink)}" target="_blank" rel="noreferrer">${escapeHtml(item.meetingLink)}</a>`;
}

function normalizeItem(item) {
  const type = item.type || "task";
  return {
    id: item.id || item.__backendId || crypto.randomUUID(),
    type,
    status: STATUS.includes(item.status) ? item.status : "idea",
    title: item.title || "Untitled",
    description: item.description || "",
    platform: item.platform || "",
    pic: item.pic || "",
    date: type === "note" ? "" : item.date || item.deadline || toDateInput(new Date()),
    time: type === "note" ? "" : item.time || "",
    campaign: item.campaign || item.tags || "",
    reminder: item.reminder || "",
    caption: item.caption || "",
    hashtags: item.hashtags || "",
    asset: item.asset || "",
    meetingFormat: item.meetingFormat || "online",
    meetingLink: item.meetingLink || "",
    meetingLocation: item.meetingLocation || "",
    workState: WORK_STATES.includes(item.workState) ? item.workState : "todo",
    createdAt: item.createdAt || new Date().toISOString(),
  };
}

function formatNoteDate(item) {
  const source = item.createdAt ? new Date(item.createdAt) : new Date();
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(source);
}

function isReminderDue(item) {
  if (!item.reminder || !item.date || item.status === "posted") return false;
  const target = new Date(`${item.date}T${item.time || "09:00"}`);
  const reminderTime = new Date(target.getTime() - Number(item.reminder) * 60 * 60 * 1000);
  const now = new Date();
  return now >= reminderTime && now <= target;
}

function countBy(source, key) {
  return source.reduce((acc, item) => {
    const value = item[key]?.trim();
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function topEntry(record) {
  return Object.entries(record).sort((a, b) => b[1] - a[1])[0];
}

function emptyState(copy) {
  return `<div class="empty-state">${copy}</div>`;
}

function showLoading(title = "Memproses", copy = "Sebentar ya, data sedang disimpan.") {
  els.loadingTitle.textContent = title;
  els.loadingCopy.textContent = copy;
  els.loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  els.loadingOverlay.classList.add("hidden");
}

function finishInitialLoad() {
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      document.body.classList.remove("app-booting");
      hideLoading();
    }, 180);
  });
}

function showToast(message = "Berhasil disimpan") {
  window.clearTimeout(toastTimer);
  els.toastMessage.textContent = message;
  els.appToast.classList.remove("hidden");
  refreshIcons();
  toastTimer = window.setTimeout(() => {
    els.appToast.classList.add("hidden");
  }, 2200);
}

function waitForSmoothFeedback() {
  return new Promise((resolve) => window.setTimeout(resolve, 280));
}

function handleStorageSync(event) {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    items = JSON.parse(event.newValue).map(normalizeItem);
    refreshFromState();
    showToast("Data terbaru sudah disinkronkan");
  } catch {
    // Ignore malformed storage updates.
  }
}

function getValue(id) {
  return document.getElementById(id).value;
}

function byTime(a, b) {
  return `${a.date} ${a.time || "00:00"}`.localeCompare(`${b.date} ${b.time || "00:00"}`);
}

function byWorkThenTime(a, b) {
  const order = { todo: 0, in_progress: 1, cancelled: 2, finished: 3 };
  const stateDiff = (order[a.workState] ?? 0) - (order[b.workState] ?? 0);
  return stateDiff || byTime(a, b);
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date);
}

function formatDateTime(item) {
  if (!item.date) return "-";
  const date = formatShortDate(parseDate(item.date));
  return item.time ? `${date}, ${item.time}` : date;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function refreshIcons(forceRetry = false) {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
    iconRetryCount = 0;
    return;
  }

  if (!forceRetry && iconRetryCount > 0) return;
  iconRetryCount += 1;
  if (iconRetryCount <= 20) {
    window.setTimeout(() => refreshIcons(true), 150);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
