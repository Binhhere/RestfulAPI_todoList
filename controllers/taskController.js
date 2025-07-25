const Task = require("../models/task");

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

// Create: create
const createTask = async (req, res) => {
  const { title, description } = req.body;
  try {
    const newTask = await Task.create({
      title,
      description,
      user: req.user.id,
    });
    res.status(201).json(newTask);
  } catch (err) {
    res.status(500).json({ error: "Failed to create task" });
  }
};

// PUT: Update a task
const updateTask = async (req, res) => {
  try {
    const updatedTask = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      req.body,
      { new: true }
    );
    if (!updatedTask)
      return res.status(404).json({ message: "Task not found" });
    res.status(200).json(updatedTask);
  } catch (err) {
    res.status(500).json({ error: "Failed to update task" });
  }
};

// DELETE: Remove a task
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
