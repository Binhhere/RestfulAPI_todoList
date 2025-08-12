const Task = require("../models/task");

// Check duplicate time
const hasOverlap = async ({ userId, startTime, endTime, excludeId = null }) => {
  if (!startTime || !endTime) return false; 
  return await Task.exists({
    user: userId,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  });
};

// GET: get task
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
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

// POST: create task
const createTask = async (req, res) => {
  try {
    const { title, description, startTime, endTime, status } = req.body;

    // validate 
    if (!title) return res.status(400).json({ error: "title is required" });
    if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
      return res
        .status(400)
        .json({ error: "startTime must be before endTime" });
    }

    // block overlap for user
    if (
      startTime &&
      endTime &&
      (await hasOverlap({
        userId: req.user.id,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
      }))
    ) {
      return res.status(409).json({ error: "Time slot already taken" });
    }

    const newTask = await Task.create({
      title,
      description,
      startTime,
      endTime,
      status,
      user: req.user.id,
    });
    res.status(201).json(newTask);
  } catch (err) {
    res.status(500).json({ error: "Failed to create task" });
  }
};

// PUT: update task
const updateTask = async (req, res) => {
  try {
    // default
    const current = await Task.findOne({
      _id: req.params.id,
      user: req.user.id,
    });
    if (!current) return res.status(404).json({ message: "Task not found" });

    // identify start/end before update
    const nextStart = req.body.startTime
      ? new Date(req.body.startTime)
      : current.startTime;
    const nextEnd = req.body.endTime
      ? new Date(req.body.endTime)
      : current.endTime;

    if (nextStart && nextEnd && nextStart >= nextEnd) {
      return res
        .status(400)
        .json({ error: "startTime must be before endTime" });
    }

    // Block overlap with other tasks
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
      { _id: req.params.id, user: req.user.id },
      req.body,
      { new: true }
    );

    res.status(200).json(updatedTask);
  } catch (err) {
    res.status(500).json({ error: "Failed to update task" });
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
    res.status(200).json({ message: "Task deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete task" });
  }
};

module.exports = {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
};
