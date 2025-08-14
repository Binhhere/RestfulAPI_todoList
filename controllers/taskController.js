// controllers/taskController.js
const crypto = require("crypto");
const Task = require("../models/task");

// overlap checker
const hasOverlap = async ({ userId, startTime, endTime, excludeId = null }) => {
  if (!startTime || !endTime) return false;
  return await Task.exists({
    user: userId,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  });
};

// occurrence generator
function* generateOccurrences({ start, end, rec }) {
  const stepOnce = (d, unit, k) => {
    const x = new Date(d);
    if (unit === "d") x.setUTCDate(x.getUTCDate() + k);
    if (unit === "w") x.setUTCDate(x.getUTCDate() + 7 * k);
    if (unit === "m") x.setUTCMonth(x.getUTCMonth() + k);
    return x;
  };

  const durMs = end - start;

  if (rec.type === "weekly" && Array.isArray(rec.daysOfWeek) && rec.daysOfWeek.length) {
    const base = new Date(start);
    let week = 0;
    while (true) {
      const weekStart = stepOnce(base, "w", week * rec.every);
      if (rec.until && weekStart > rec.until) break;

      for (const dow of [...rec.daysOfWeek].sort()) {
        const n = new Date(weekStart);
        const delta = (dow - n.getUTCDay() + 7) % 7;
        n.setUTCDate(n.getUTCDate() + delta);
        const s = new Date(n);
        const e = new Date(s.getTime() + durMs);
        if (rec.until && s > rec.until) return;
        yield { startTime: s, endTime: e };
      }
      week++;
    }
    return;
  }

  let curStart = new Date(start);
  let curEnd = new Date(end);
  // daily / monthly
  while (true) {
    if (rec.until && curStart > rec.until) break;
    yield { startTime: new Date(curStart), endTime: new Date(curEnd) };
    if (rec.type === "daily") {
      curStart = stepOnce(curStart, "d", rec.every);
      curEnd = stepOnce(curEnd, "d", rec.every);
    } else if (rec.type === "monthly") {
      curStart = stepOnce(curStart, "m", rec.every);
      curEnd = stepOnce(curEnd, "m", rec.every);
    } else {
      break; // safety
    }
  }
}

// GET: list tasks
const getTasks = async (req, res) => {
  try {
    const keyword = req.query.title
      ? { title: { $regex: req.query.title, $options: "i" } }
      : {};

    const tasks = await Task.find({
      user: req.user.id,
      ...keyword,
    });

    res.status(200).json(tasks);
  } catch {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

// POST: create task (supports recurrence)
const createTask = async (req, res) => {
  try {
    const { title, description, startTime, endTime, status, recurrence } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const s = startTime ? new Date(startTime) : null;
    const e = endTime ? new Date(endTime) : null;
    if (s && e && s >= e) {
      return res.status(400).json({ error: "startTime must be before endTime" });
    }

    const userId = req.user.id;

    // no recurrence → original behavior with overlap check
    if (!recurrence || recurrence.type === "none") {
      if (s && e && (await hasOverlap({ userId, startTime: s, endTime: e }))) {
        return res.status(409).json({ error: "Time slot already taken" });
      }
      const doc = await Task.create({
        title,
        description,
        startTime: s || null,
        endTime: e || null,
        status,
        user: userId,
        recurrence: { type: "none", every: 1, daysOfWeek: [] },
      });
      return res.status(201).json(doc);
    }

    // recurrence flow
    const rec = {
      type: recurrence.type,
      every: Number(recurrence.every || 1),
      until: recurrence.until ? new Date(recurrence.until) : null,
      daysOfWeek: Array.isArray(recurrence.daysOfWeek) ? recurrence.daysOfWeek : [],
    };

    if (!s || !e || !rec.until) {
      return res
        .status(400)
        .json({ error: "startTime, endTime, and recurrence.until are required for recurrence" });
    }

    const seriesId = crypto.randomUUID();
    const maxGen = 500; // guardrail
    const occurrences = [];
    let produced = 0;

    for (const occ of generateOccurrences({ start: s, end: e, rec })) {
      if (++produced > maxGen) break;

      if (await hasOverlap({ userId, startTime: occ.startTime, endTime: occ.endTime })) {
        return res.status(409).json({
          error: "Time slot already taken",
          conflict: { startTime: occ.startTime, endTime: occ.endTime },
        });
      }

      occurrences.push({
        title,
        description,
        status,
        startTime: occ.startTime,
        endTime: occ.endTime,
        user: userId,
        seriesId,
        recurrence: rec,
      });
    }

    if (occurrences.length === 0) {
      return res.status(400).json({ error: "No occurrences generated within the given range" });
    }

    const inserted = await Task.insertMany(occurrences);
    return res.status(201).json({ seriesId, count: inserted.length, items: inserted });
  } catch {
    return res.status(500).json({ error: "Failed to create task" });
  }
};

// PUT: update single task (does not convert to recurrence)
const updateTask = async (req, res) => {
  try {
    const current = await Task.findOne({ _id: req.params.id, user: req.user.id });
    if (!current) return res.status(404).json({ message: "Task not found" });

    if (req.body.recurrence && req.body.recurrence.type && req.body.recurrence.type !== "none") {
      return res
        .status(400)
        .json({ error: "Updating recurrence on an existing item is not supported" });
    }

    const nextStart = req.body.startTime ? new Date(req.body.startTime) : current.startTime;
    const nextEnd = req.body.endTime ? new Date(req.body.endTime) : current.endTime;

    if (nextStart && nextEnd && nextStart >= nextEnd) {
      return res.status(400).json({ error: "startTime must be before endTime" });
    }

    if (
      nextStart &&
      nextEnd &&
      (await hasOverlap({
        userId: req.user.id,
        startTime: nextStart,
        endTime: nextEnd,
        excludeId: current._id,
      }))
    ) {
      return res.status(409).json({ error: "Time slot already taken" });
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: current._id, user: req.user.id },
      req.body,
      { new: true }
    );

    return res.status(200).json(updatedTask);
  } catch {
    return res.status(500).json({ error: "Failed to update task" });
  }
};

// DELETE: remove task
const deleteTask = async (req, res) => {
  try {
    const deleted = await Task.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });
    if (!deleted) return res.status(404).json({ message: "Task not found" });
    return res.status(200).json({ message: "Task deleted successfully" });
  } catch {
    return res.status(500).json({ error: "Failed to delete task" });
  }
};

module.exports = {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
};
