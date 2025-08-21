// controllers/taskController.js
const crypto = require("crypto");
const Task = require("../models/task");

// ---------- helpers ----------
const normalizeRec = (rec) => {
  if (!rec || rec.type === "none") {
    return { type: "none", every: 1, until: null, daysOfWeek: [] };
  }
  return {
    type: rec.type, // "daily" | "weekly" | "monthly"
    every: Number(rec.every || 1),
    until: rec.until ? new Date(rec.until) : null,
    daysOfWeek: Array.isArray(rec.daysOfWeek) ? rec.daysOfWeek : [],
  };
};

const hasOverlap = async ({ userId, startTime, endTime, excludeId = null }) => {
  if (!startTime || !endTime) return false;
  return await Task.exists({
    user: userId,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  });
};

// generator occurrences
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

  // daily / monthly
  let curStart = new Date(start);
  let curEnd = new Date(end);
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
      break;
    }
  }
}

const buildOccurrenceDocs = async ({
  userId,
  baseFields,
  startTime,
  endTime,
  rec,
  maxGen = 500,
  excludeId = null, // exclude overlap vs the current doc when rebuilding
  seriesId = crypto.randomUUID(),
}) => {
  if (!startTime || !endTime) {
    throw Object.assign(new Error("startTime/endTime required"), { status: 400 });
  }
  if (!rec.until) {
    throw Object.assign(new Error("recurrence.until required"), { status: 400 });
  }

  const occurrences = [];
  let produced = 0;

  for (const occ of generateOccurrences({ start: startTime, end: endTime, rec })) {
    if (++produced > maxGen) break;

    const conflict = await hasOverlap({
      userId,
      startTime: occ.startTime,
      endTime: occ.endTime,
      excludeId,
    });
    if (conflict) {
      const err = new Error("Time slot already taken");
      err.status = 409;
      err.payload = { conflict: { startTime: occ.startTime, endTime: occ.endTime } };
      throw err;
    }

    occurrences.push({
      ...baseFields,
      startTime: occ.startTime,
      endTime: occ.endTime,
      user: userId,
      seriesId,
      recurrence: rec,
      isRecurring: true,
    });
  }

  if (occurrences.length === 0) {
    throw Object.assign(new Error("No occurrences generated within the given range"), {
      status: 400,
    });
  }

  return { seriesId, occurrences };
};

// ---------- controllers ----------

// GET: list tasks
const getTasks = async (req, res) => {
  try {
    const keyword = req.query.title
      ? { title: { $regex: req.query.title, $options: "i" } }
      : {};

    const tasks = await Task.find({
      user: req.user.id,
      ...keyword,
    }).sort({ startTime: 1, createdAt: -1 });

    res.status(200).json(tasks);
  } catch (e) {
    console.error(e);
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
    const rec = normalizeRec(recurrence);

    // non-recurring
    if (rec.type === "none") {
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
        recurrence: { type: "none", every: 1, daysOfWeek: [], until: null },
        isRecurring: false,
      });
      return res.status(201).json(doc);
    }

    // recurring series
    if (!s || !e || !rec.until) {
      return res
        .status(400)
        .json({ error: "startTime, endTime, and recurrence.until are required for recurrence" });
    }

    const { seriesId, occurrences } = await buildOccurrenceDocs({
      userId,
      baseFields: { title, description, status },
      startTime: s,
      endTime: e,
      rec,
    });

    const inserted = await Task.insertMany(occurrences);
    return res.status(201).json({ seriesId, count: inserted.length, items: inserted });
  } catch (e) {
    console.error(e);
    const code = e.status || 500;
    const body = e.payload ? { error: e.message, ...e.payload } : { error: e.message || "Failed to create task" };
    return res.status(code).json(body);
  }
};

// PUT: update task (supports toggling and editing recurrence)
// Rules:
// - If body.isRecurring === false: convert this item to single (clear seriesId/recurrence), keep others intact.
// - If body.isRecurring === true (or recurrence.type !== "none"):
//     * If current is single → create a new series from provided s/e/rec; reuse current doc for the first occurrence, insert the rest.
//     * If current is recurring → rebuild the whole seriesId with the new s/e/rec (delete siblings then regenerate).
// - Else: normal single update with overlap check.
const updateTask = async (req, res) => {
  try {
    const userId = req.user.id;
    const current = await Task.findOne({ _id: req.params.id, user: userId });
    if (!current) return res.status(404).json({ message: "Task not found" });

    // incoming fields
    const {
      title,
      description,
      status,
      startTime: inStart,
      endTime: inEnd,
      isRecurring: inIsRecurring,
      recurrence: inRecurrence,
    } = req.body;

    // resolve next fields for simple updates
    const nextStart = inStart ? new Date(inStart) : current.startTime;
    const nextEnd = inEnd ? new Date(inEnd) : current.endTime;
    if (nextStart && nextEnd && nextStart >= nextEnd) {
      return res.status(400).json({ error: "startTime must be before endTime" });
    }

    const wantRec = typeof inIsRecurring === "boolean" ? inIsRecurring : current.isRecurring;
    const rec = normalizeRec(inRecurrence ?? current.recurrence);

    // ----- Case A: Force single (turn off recurrence for this item only)
    if (wantRec === false) {
      // overlap check if time changed
      if (
        nextStart &&
        nextEnd &&
        (await hasOverlap({
          userId,
          startTime: nextStart,
          endTime: nextEnd,
          excludeId: current._id,
        }))
      ) {
        return res.status(409).json({ error: "Time slot already taken" });
      }

      const updated = await Task.findOneAndUpdate(
        { _id: current._id, user: userId },
        {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(status !== undefined ? { status } : {}),
          startTime: nextStart ?? null,
          endTime: nextEnd ?? null,
          isRecurring: false,
          seriesId: null,
          recurrence: { type: "none", every: 1, until: null, daysOfWeek: [] },
        },
        { new: true }
      );

      // Note: siblings of the old series (if any) are untouched by design.
      return res.status(200).json(updated);
    }

    // ----- Case B: Want recurring (either convert single → series, or edit existing series)
    if (wantRec === true && rec.type !== "none") {
      // need start/end/until
      if (!nextStart || !nextEnd) {
        return res
          .status(400)
          .json({ error: "startTime and endTime are required when enabling recurrence" });
      }
      if (!rec.until) {
        return res
          .status(400)
          .json({ error: "recurrence.until is required when enabling recurrence" });
      }

      // If currently recurring → rebuild whole series
      if (current.isRecurring && current.seriesId) {
        // remove all in current series
        await Task.deleteMany({ user: userId, seriesId: current.seriesId });

        // build new series with same seriesId to keep linkage stable
        const { seriesId, occurrences } = await buildOccurrenceDocs({
          userId,
          baseFields: {
            title: title ?? current.title,
            description: description ?? current.description,
            status: status ?? current.status,
          },
          startTime: nextStart,
          endTime: nextEnd,
          rec,
          seriesId: current.seriesId,
        });

        const inserted = await Task.insertMany(occurrences);
        return res.status(200).json({ seriesId, count: inserted.length, items: inserted });
      }

      // Currently single → create a new series; reuse this doc for the first occurrence if times match one of them
      const baseFields = {
        title: title ?? current.title,
        description: description ?? current.description,
        status: status ?? current.status,
      };

      const { seriesId, occurrences } = await buildOccurrenceDocs({
        userId,
        baseFields,
        startTime: nextStart,
        endTime: nextEnd,
        rec,
        excludeId: current._id, // allow its own current slot
      });

      // choose first occurrence as the updated current
      const first = occurrences[0];

      // update current to first
      const updatedCurrent = await Task.findOneAndUpdate(
        { _id: current._id, user: userId },
        {
          ...baseFields,
          startTime: first.startTime,
          endTime: first.endTime,
          isRecurring: true,
          seriesId,
          recurrence: rec,
        },
        { new: true }
      );

      // insert the rest
      const rest = occurrences.slice(1);
      if (rest.length) await Task.insertMany(rest);

      return res
        .status(200)
        .json({ seriesId, items: [updatedCurrent, ...rest], count: 1 + rest.length });
    }

    // ----- Case C: Normal single-task update (no recurrence change)
    if (
      nextStart &&
      nextEnd &&
      (await hasOverlap({
        userId,
        startTime: nextStart,
        endTime: nextEnd,
        excludeId: current._id,
      }))
    ) {
      return res.status(409).json({ error: "Time slot already taken" });
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: current._id, user: userId },
      {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(inStart !== undefined ? { startTime: nextStart } : {}),
        ...(inEnd !== undefined ? { endTime: nextEnd } : {}),
        // keep recurrence fields as-is if not toggled
      },
      { new: true }
    );

    return res.status(200).json(updatedTask);
  } catch (e) {
    console.error(e);
    const code = e.status || 500;
    const body = e.payload ? { error: e.message, ...e.payload } : { error: "Failed to update task" };
    return res.status(code).json(body);
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
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete task" });
  }
};

module.exports = {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
};
