(() => {
  "use strict";

  const STORAGE_KEY = "studyspace-v1";
  const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const dateOffset = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const makeInitialState = () => ({
    tasks: [
      { id: crypto.randomUUID(), title: "Review Big Data Analytics notes", description: "Revise MapReduce, HDFS and the key concepts from today’s lecture.", dueDate: today(), dueTime: "17:00", category: "Big Data Analytics", priority: "high", completed: false, reminder: false },
      { id: crypto.randomUUID(), title: "Attend HCL class", description: "Join on time and note down questions for the next session.", dueDate: today(), dueTime: "18:30", category: "HCL Classes", priority: "high", completed: false, reminder: false },
      { id: crypto.randomUUID(), title: "Revise yesterday’s class notes", description: "Spend 20 minutes reviewing your handwritten notes.", dueDate: today(), dueTime: "", category: "Notes Revision", priority: "medium", completed: false, reminder: false },
      { id: crypto.randomUUID(), title: "Read one chapter for tomorrow", description: "A quiet 25-minute reading session. One chapter is enough.", dueDate: dateOffset(1), dueTime: "10:00", category: "Reading", priority: "low", completed: false, reminder: false },
      { id: crypto.randomUUID(), title: "Finish analytics assignment", description: "Complete the dataset analysis and check your submission.", dueDate: dateOffset(2), dueTime: "16:00", category: "Assignment", priority: "medium", completed: false, reminder: false }
    ],
    attendance: null,
    completedDays: [],
    focusSessions: 0,
    focusDate: today(),
    timer: { mode: "focus", minutes: 25, remaining: 25 * 60, endAt: null },
    notifiedTasks: []
  });

  let state;
  let currentView = "today";
  let currentFilter = "all";
  let editingTaskId = null;
  let toastTimeout;
  let timerInterval;
  const el = (id) => document.getElementById(id);
  const taskDialog = el("taskDialog");

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return makeInitialState();
      const parsed = JSON.parse(stored);
      const initial = makeInitialState();
      return {
        ...initial,
        ...parsed,
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : initial.tasks,
        completedDays: Array.isArray(parsed.completedDays) ? parsed.completedDays : [],
        notifiedTasks: Array.isArray(parsed.notifiedTasks) ? parsed.notifiedTasks : [],
        timer: { ...initial.timer, ...(parsed.timer || {}) }
      };
    } catch (error) {
      console.error("Could not load Studyspace data from this browser.", error);
      return makeInitialState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error("Could not save Studyspace data in this browser.", error);
      showToast("Your changes could not be saved. Check this browser’s storage settings.");
      return false;
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[character]));
  }

  function formatDate(dateString) {
    if (!dateString) return "No due date";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${dateString}T12:00:00`));
  }

  function formatTime(time) {
    if (!time) return "";
    const [hours, minutes] = time.split(":").map(Number);
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hours, minutes));
  }

  function dueLabel(task) {
    if (task.dueDate === today()) return task.dueTime ? `Today · ${formatTime(task.dueTime)}` : "Today";
    if (task.dueDate < today()) return `Overdue · ${formatDate(task.dueDate)}`;
    if (task.dueDate === dateOffset(1)) return task.dueTime ? `Tomorrow · ${formatTime(task.dueTime)}` : "Tomorrow";
    return task.dueTime ? `${formatDate(task.dueDate)} · ${formatTime(task.dueTime)}` : formatDate(task.dueDate);
  }

  function categoryClass(category) {
    if (category === "HCL Classes" || category === "Assignment") return "cat-orange";
    if (category === "Reading") return "cat-cyan";
    if (category === "Notes Revision") return "cat-pink";
    if (category === "Other") return "cat-green";
    return "";
  }

  function taskMatchesView(task) {
    if (currentView === "today") return task.dueDate === today();
    if (currentView === "upcoming") return !task.completed && task.dueDate > today();
    if (currentView === "completed") return task.completed;
    return true;
  }

  function renderTasks() {
    const query = el("taskSearch").value.trim().toLowerCase();
    const priority = el("priorityFilter").value;
    let tasks = state.tasks.filter(taskMatchesView);
    if (currentFilter === "active") tasks = tasks.filter((task) => !task.completed);
    if (currentFilter === "completed") tasks = tasks.filter((task) => task.completed);
    if (priority !== "all") tasks = tasks.filter((task) => task.priority === priority);
    if (query) tasks = tasks.filter((task) => `${task.title} ${task.description} ${task.category}`.toLowerCase().includes(query));
    tasks.sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate) || (a.dueTime || "23:59").localeCompare(b.dueTime || "23:59"));

    const list = el("taskList");
    const labels = { today: "Today’s tasks", all: "All tasks", upcoming: "Upcoming tasks", completed: "Completed tasks" };
    el("taskListHeading").textContent = labels[currentView] || "Today’s tasks";
    el("taskHeadingCount").textContent = tasks.length;
    el("taskFooterText").textContent = `${state.tasks.length} ${state.tasks.length === 1 ? "task" : "tasks"} · Saved privately on this device`;
    list.innerHTML = tasks.map((task) => {
      const dueClass = task.dueDate < today() && !task.completed ? "overdue" : task.dueDate === today() && !task.completed ? "due-today" : "";
      return `<article class="task-row ${task.completed ? "is-completed" : ""}" data-task-id="${escapeHTML(task.id)}">
        <input class="task-check" type="checkbox" aria-label="Mark ${escapeHTML(task.title)} as ${task.completed ? "not completed" : "completed"}" ${task.completed ? "checked" : ""}>
        <div class="task-main"><div class="task-title-line"><span class="task-title">${escapeHTML(task.title)}</span><span class="category-tag ${categoryClass(task.category)}">${escapeHTML(task.category)}</span>${task.reminder ? '<span class="reminder-mark" title="Reminder enabled">◷</span>' : ""}</div>${task.description ? `<div class="task-description">${escapeHTML(task.description)}</div>` : ""}</div>
        <div class="task-meta"><span class="task-due ${dueClass}">${escapeHTML(dueLabel(task))}</span><span class="priority-badge priority-${escapeHTML(task.priority)}">${escapeHTML(task.priority[0].toUpperCase() + task.priority.slice(1))}</span></div>
        <button class="row-action edit-action" type="button" aria-label="Edit ${escapeHTML(task.title)}" title="Edit task">✎</button><button class="row-action delete-action" type="button" aria-label="Delete ${escapeHTML(task.title)}" title="Delete task">×</button>
      </article>`;
    }).join("");

    const empty = tasks.length === 0;
    el("emptyState").hidden = !empty;
    list.hidden = empty;
    if (empty) {
      const isFiltered = Boolean(query) || priority !== "all" || currentFilter !== "all";
      el("emptyTitle").textContent = isFiltered ? "No tasks match those filters" : currentView === "completed" ? "Nothing completed just yet" : "Nothing on your list";
      el("emptyMessage").textContent = isFiltered ? "Try changing your search or filters to see more tasks." : currentView === "completed" ? "Every task you complete will find its way here." : "A clear list, a clear mind. Add your next task when you’re ready.";
    }
  }

  function calculateStreak() {
    const days = new Set(state.completedDays || []);
    let cursor = today();
    if (!days.has(cursor)) cursor = dateOffset(-1);
    let count = 0;
    while (days.has(cursor)) {
      count++;
      const [year, month, day] = cursor.split("-").map(Number);
      const previous = new Date(year, month - 1, day - 1);
      cursor = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-${String(previous.getDate()).padStart(2, "0")}`;
    }
    return count;
  }

  function renderAttendanceSummary() {
    const record = state.attendance;
    if (!record || !record.held) {
      el("miniAttendancePercent").innerHTML = "—<small>%</small>";
      el("miniAttendanceClasses").textContent = "Set up your classes";
      return;
    }
    const percent = Math.round(record.attended / record.held * 100);
    el("miniAttendancePercent").innerHTML = `${percent}<small>%</small>`;
    el("miniAttendanceClasses").textContent = `${record.attended} of ${record.held} classes attended`;
  }

  function renderDashboard() {
    const all = state.tasks;
    const completed = all.filter((task) => task.completed);
    const dueToday = all.filter((task) => task.dueDate === today() && !task.completed);
    const upcoming = all.filter((task) => task.dueDate > today() && !task.completed);
    const percent = all.length ? Math.round(completed.length / all.length * 100) : 0;
    el("statToday").textContent = dueToday.length;
    el("statCompleted").textContent = completed.length;
    el("statUpcoming").textContent = upcoming.length;
    el("navTodayCount").textContent = dueToday.length;
    el("progressPercent").textContent = `${percent}%`;
    el("progressOrbit").style.background = `conic-gradient(#b49aff ${percent * 3.6}deg,#765da7 ${percent * 3.6}deg,#4e4859 ${percent * 3.6}deg,#4e4859 360deg)`;
    el("progressSummary").textContent = all.length && completed.length === all.length ? "Everything is done!" : completed.length ? `${completed.length} ${completed.length === 1 ? "task" : "tasks"} complete` : "Let’s get started";
    el("progressSubtext").textContent = all.length ? `${all.length - completed.length} left in your plan` : "Your goals are waiting";
    el("heroHeadline").innerHTML = all.length && completed.length === all.length ? "Look at you go.<br>You did it!" : dueToday.length ? "A fresh start is a<br>beautiful thing." : "Make room for<br>what matters.";
    el("heroDescription").textContent = dueToday.length ? "Choose one task and get into your rhythm." : "A little progress is still progress.";
    el("statStreak").textContent = calculateStreak();
    el("focusCompleted").textContent = completed.length;
    if (state.focusDate !== today()) {
      state.focusDate = today();
      state.focusSessions = 0;
      saveState();
    }
    el("focusSessions").textContent = state.focusSessions || 0;
    renderAttendanceSummary();
  }

  function calculateAttendance(record) {
    const { held, attended, target, subject } = record;
    const percent = held ? attended / held * 100 : 0;
    el("attendancePercent").textContent = held ? `${percent.toFixed(1)}%` : "—%";
    const angle = Math.min(percent, 100) * 3.6;
    el("attendanceOrbit").style.background = `conic-gradient(${percent >= target ? "#78d9b0" : "#f0b275"} ${angle}deg,#55445f ${angle}deg,#37323e ${angle}deg,#37323e 360deg)`;
    el("resultSubject").textContent = subject || "Your attendance snapshot";
    el("resultAttended").textContent = attended;
    el("resultMissed").textContent = held - attended;
    const status = el("attendanceStatus");
    const advice = el("attendanceAdvice");
    if (percent >= target) {
      status.className = "result-status status-good";
      status.textContent = `You’re meeting your ${target}% target. Nice work!`;
      const canMiss = target < 100 ? Math.max(0, Math.floor(attended / (target / 100) - held + 1e-9)) : 0;
      advice.textContent = canMiss ? `You can miss up to ${canMiss} more ${canMiss === 1 ? "class" : "classes"} and remain at ${target}% or above.` : "Keep attending each class to stay at or above your target.";
    } else {
      status.className = "result-status status-low";
      status.textContent = `You’re below your ${target}% target. There’s still time to catch up.`;
      const needed = target === 100 ? null : Math.ceil((target / 100 * held - attended) / (1 - target / 100));
      advice.textContent = needed === null ? "A 100% target can’t be reached after missing a class, but attending every class from now on will improve your percentage." : `Attend the next ${needed} ${needed === 1 ? "class" : "classes"} in a row to reach ${target}%.`;
    }
  }

  function renderAttendance() {
    const record = state.attendance;
    if (!record) return;
    el("attendanceSubject").value = record.subject || "";
    el("classesHeld").value = record.held;
    el("classesAttended").value = record.attended;
    el("requiredPercent").value = record.target || 75;
    calculateAttendance(record);
  }

  function setView(view) {
    currentView = view;
    const attendance = view === "attendance";
    const focus = view === "focus";
    el("tasksView").hidden = attendance || focus;
    el("attendanceView").hidden = !attendance;
    el("focusView").hidden = !focus;
    const names = { today: "Today", all: "All tasks", upcoming: "Upcoming", completed: "Completed", attendance: "Attendance", focus: "Focus room" };
    el("breadcrumbPage").textContent = names[view] || "Today";
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    el("sidebar").classList.remove("open");
    el("mobileMenu").setAttribute("aria-expanded", "false");
    if (attendance) renderAttendance();
    if (view === "today") {
      el("taskSearch").value = "";
      el("priorityFilter").value = "all";
      currentFilter = "all";
      document.querySelectorAll(".filter-tab").forEach((button) => button.classList.toggle("selected", button.dataset.filter === "all"));
    }
    renderTasks();
  }

  function openTaskDialog(task = null) {
    editingTaskId = task ? task.id : null;
    el("dialogTitle").textContent = task ? "Edit task" : "Add a task";
    el("saveTaskButton").innerHTML = task ? "Save changes <span>→</span>" : "Add task <span>→</span>";
    el("taskTitle").value = task?.title || "";
    el("taskDescription").value = task?.description || "";
    el("taskDueDate").value = task?.dueDate || today();
    el("taskDueTime").value = task?.dueTime || "";
    el("taskCategory").value = task?.category || "Big Data Analytics";
    el("taskPriority").value = task?.priority || "medium";
    el("taskReminder").checked = Boolean(task?.reminder);
    if (typeof taskDialog.showModal === "function") taskDialog.showModal();
    else taskDialog.setAttribute("open", "");
    el("taskTitle").focus();
  }

  function closeTaskDialog() {
    if (typeof taskDialog.close === "function") taskDialog.close();
    else taskDialog.removeAttribute("open");
  }

  function showToast(message) {
    const toast = el("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("visible"), 3000);
  }

  function updateTask(id, updates) {
    state.tasks = state.tasks.map((task) => task.id === id ? { ...task, ...updates } : task);
    saveState();
    renderTasks();
    renderDashboard();
  }

  function taskDateTime(task) {
    return new Date(`${task.dueDate}T${task.dueTime || "09:00"}:00`);
  }

  function checkReminders() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const now = Date.now();
    state.tasks.forEach((task) => {
      if (!task.reminder || task.completed || state.notifiedTasks.includes(task.id)) return;
      const due = taskDateTime(task).getTime();
      if (due <= now && due > now - 60_000) {
        new Notification("Studyspace reminder", { body: `${task.title} is due now. You’ve got this!` });
        state.notifiedTasks.push(task.id);
        showToast(`Reminder: ${task.title}`);
        saveState();
      }
    });
  }

  function displayTimer() {
    const timer = state.timer;
    if (timer.endAt) timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    const minutes = Math.floor(timer.remaining / 60);
    const seconds = timer.remaining % 60;
    el("timerDisplay").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    el("timerMode").textContent = timer.mode === "focus" ? "FOCUS TIME" : "BREAK TIME";
    el("focusSessionLabel").textContent = `${timer.mode === "focus" ? "POMODORO" : "BREAK"} · ${timer.minutes} MIN`;
    el("timerHint").textContent = timer.mode === "focus" ? "You’ve got this." : "You’ve earned this pause.";
    const circumference = 2 * Math.PI * 118;
    const fraction = timer.remaining / (timer.minutes * 60);
    el("timerProgress").style.strokeDasharray = circumference;
    el("timerProgress").style.strokeDashoffset = circumference * (1 - fraction);
    el("timerStart").innerHTML = timer.endAt ? "Pause session <span>Ⅱ</span>" : timer.remaining === 0 ? "Start another <span>→</span>" : "Start focusing <span>→</span>";
    el("sessionComplete").hidden = timer.remaining !== 0;
    document.querySelectorAll(".mode-button").forEach((button) => button.classList.toggle("selected", Number(button.dataset.minutes) === timer.minutes && button.dataset.mode === timer.mode));
  }

  function handleTimerFinish() {
    const wasFocus = state.timer.mode === "focus";
    state.timer.remaining = 0;
    state.timer.endAt = null;
    if (wasFocus) {
      state.focusSessions = (state.focusSessions || 0) + 1;
      showToast("Focus session complete. Take a moment to celebrate!");
    } else {
      showToast("Break time is over. Ready when you are.");
    }
    saveState();
    renderDashboard();
    displayTimer();
  }

  function toggleTimer() {
    const timer = state.timer;
    if (timer.endAt) {
      timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
      timer.endAt = null;
      clearInterval(timerInterval);
      timerInterval = null;
    } else {
      if (timer.remaining <= 0) timer.remaining = timer.minutes * 60;
      timer.endAt = Date.now() + timer.remaining * 1000;
      timerInterval = setInterval(() => {
        if (state.timer.endAt && state.timer.endAt <= Date.now()) {
          clearInterval(timerInterval);
          timerInterval = null;
          handleTimerFinish();
        } else {
          displayTimer();
        }
      }, 250);
    }
    saveState();
    displayTimer();
  }

  function initialize() {
    state = loadState();
    if (state.focusDate !== today()) {
      state.focusDate = today();
      state.focusSessions = 0;
    }
    const now = new Date();
    el("topDate").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(now);
    const hour = now.getHours();
    el("greeting").innerHTML = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, student<span class="heading-period">.</span>`;

    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    document.querySelectorAll(".filter-tab").forEach((button) => button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.toggle("selected", tab === button));
      renderTasks();
    }));
    el("taskSearch").addEventListener("input", renderTasks);
    el("priorityFilter").addEventListener("change", renderTasks);
    el("addTaskButton").addEventListener("click", () => openTaskDialog());
    el("emptyAddButton").addEventListener("click", () => openTaskDialog());
    el("viewAllButton").addEventListener("click", () => setView("all"));
    el("heroFocusButton").addEventListener("click", () => setView("focus"));
    el("attendanceAddTask").addEventListener("click", () => openTaskDialog({ category: "HCL Classes" }));
    el("mobileMenu").addEventListener("click", () => {
      const open = el("sidebar").classList.toggle("open");
      el("mobileMenu").setAttribute("aria-expanded", String(open));
    });
    el("closeDialog").addEventListener("click", closeTaskDialog);
    el("cancelDialog").addEventListener("click", closeTaskDialog);
    taskDialog.addEventListener("click", (event) => {
      if (event.target === taskDialog) closeTaskDialog();
    });
    el("taskForm").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!el("taskForm").reportValidity()) return;
      const task = {
        title: el("taskTitle").value.trim(),
        description: el("taskDescription").value.trim(),
        dueDate: el("taskDueDate").value,
        dueTime: el("taskDueTime").value,
        category: el("taskCategory").value,
        priority: el("taskPriority").value,
        reminder: el("taskReminder").checked
      };
      if (!task.title || !task.dueDate) return;
      if (editingTaskId) {
        state.tasks = state.tasks.map((item) => item.id === editingTaskId ? { ...item, ...task } : item);
        showToast("Your task has been updated.");
      } else {
        state.tasks.push({ id: crypto.randomUUID(), ...task, completed: false });
        showToast("Task added. You’ve got this!");
      }
      saveState();
      closeTaskDialog();
      renderTasks();
      renderDashboard();
    });
    el("taskList").addEventListener("change", (event) => {
      const checkbox = event.target.closest(".task-check");
      if (!checkbox) return;
      const row = checkbox.closest(".task-row");
      const task = state.tasks.find((item) => item.id === row.dataset.taskId);
      if (!task) return;
      const completed = checkbox.checked;
      updateTask(task.id, { completed, ...(completed ? { completedAt: today() } : {}) });
      if (completed) {
        state.completedDays = [...new Set([...(state.completedDays || []), today()])];
        saveState();
        showToast("Task complete. Take a second to feel good about that.");
      }
    });
    el("taskList").addEventListener("click", (event) => {
      const row = event.target.closest(".task-row");
      if (!row) return;
      const task = state.tasks.find((item) => item.id === row.dataset.taskId);
      if (!task) return;
      if (event.target.closest(".edit-action")) openTaskDialog(task);
      if (event.target.closest(".delete-action")) {
        state.tasks = state.tasks.filter((item) => item.id !== task.id);
        state.notifiedTasks = state.notifiedTasks.filter((id) => id !== task.id);
        saveState();
        renderTasks();
        renderDashboard();
        showToast("Task removed from your plan.");
      }
    });
    el("attendanceForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const subject = el("attendanceSubject").value.trim();
      const held = Number(el("classesHeld").value);
      const attended = Number(el("classesAttended").value);
      const target = Number(el("requiredPercent").value);
      let error = "";
      if (!Number.isInteger(held) || held <= 0) error = "Enter at least one class held.";
      else if (!Number.isInteger(attended) || attended < 0 || attended > held) error = "Classes attended must be between zero and classes held.";
      else if (!Number.isFinite(target) || target < 1 || target > 100) error = "Your target must be between 1% and 100%.";
      el("attendanceError").textContent = error;
      el("attendanceError").hidden = !error;
      if (error) return;
      state.attendance = { subject: subject || "My classes", held, attended, target };
      saveState();
      renderAttendance();
      renderDashboard();
      showToast("Attendance updated and saved on this device.");
    });
    document.querySelectorAll(".mode-button").forEach((button) => button.addEventListener("click", () => {
      clearInterval(timerInterval);
      timerInterval = null;
      state.timer = { mode: button.dataset.mode, minutes: Number(button.dataset.minutes), remaining: Number(button.dataset.minutes) * 60, endAt: null };
      saveState();
      displayTimer();
    }));
    el("timerStart").addEventListener("click", toggleTimer);
    el("timerReset").addEventListener("click", () => {
      clearInterval(timerInterval);
      timerInterval = null;
      state.timer.remaining = state.timer.minutes * 60;
      state.timer.endAt = null;
      saveState();
      displayTimer();
    });
    el("notificationButton").addEventListener("click", async () => {
      if (!("Notification" in window)) {
        showToast("Browser notifications aren’t available here. Keep Studyspace open to use your task list.");
        return;
      }
      if (Notification.permission === "granted") {
        showToast("Browser reminders are enabled for tasks with a reminder set.");
        return;
      }
      if (Notification.permission === "denied") {
        showToast("Notifications are blocked in your browser settings. You can still use Studyspace without them.");
        return;
      }
      try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          el("notificationButton").classList.add("enabled");
          showToast("Reminders enabled. Add a task and switch on its reminder.");
          checkReminders();
        } else {
          showToast("Notifications weren’t enabled. You can turn them on in browser settings.");
        }
      } catch (error) {
        console.error("Could not request browser notification permission.", error);
        showToast("Could not enable reminders in this browser.");
      }
    });

    renderDashboard();
    renderTasks();
    renderAttendance();
    displayTimer();
    if ("Notification" in window && Notification.permission === "granted") el("notificationButton").classList.add("enabled");
    setInterval(checkReminders, 30_000);
    checkReminders();
  }

  initialize();
})();
