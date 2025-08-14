const mongoose = require("mongoose");

const RecurrenceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly"],
      default: "none",
    },
    every: {
      type: Number,
      default: 1,
      min: 1,
    },
    until: {
      type: Date,
    },
    daysOfWeek: {
      type: [Number],
      default: [],
    },
  },
  { _id: false }
);

const TaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please add a title"],
    },
    description: {
      type: String,
      default: "",
    },
    dueDate: {
      type: Date,
    },
    startTime: {
      type: Date,
    },
    endTime: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["pending", "in progress", "completed"],
      default: "pending",
    },
    seriesId: {
      type: String,
      index: true,
    },
    recurrence: {
      type: RecurrenceSchema,
      default: () => ({}),
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

TaskSchema.index({ user: 1, startTime: 1 });
TaskSchema.index({ user: 1, endTime: 1 });

module.exports = mongoose.model("Task", TaskSchema);
