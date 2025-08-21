const mongoose = require("mongoose");

const RecurrenceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly"],
      default: "none",
    },
    every: { type: Number, default: 1, min: 1 },
    until: { type: Date, default: null },
    daysOfWeek: {
      type: [Number],
      default: [],
      validate: {
        validator: (arr) =>
          arr.every((n) => Number.isInteger(n) && n >= 0 && n <= 6),
        message: "daysOfWeek must be integers in [0..6]",
      },
    },
  },
  { _id: false }
);

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "Please add a title"], trim: true },
    description: { type: String, default: "" },
    dueDate: { type: Date },
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
    status: {
      type: String,
      enum: ["pending", "in progress", "completed"],
      default: "pending",
    },

    isRecurring: { type: Boolean, default: false, index: true },
    seriesId: { type: String, default: null, index: true },
    recurrence: {
      type: RecurrenceSchema,
      default: () => ({ type: "none", every: 1, until: null, daysOfWeek: [] }),
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

TaskSchema.index({ user: 1, seriesId: 1 });
TaskSchema.index({ user: 1, startTime: 1 });
TaskSchema.index({ user: 1, endTime: 1 });

// validate type
TaskSchema.pre("validate", function (next) {
  if (this.startTime && this.endTime && this.startTime >= this.endTime) {
    return next(new Error("startTime must be before endTime"));
  }

  if (!this.isRecurring) {
    this.seriesId = null;
    this.recurrence = { type: "none", every: 1, until: null, daysOfWeek: [] };
  } else {
    if (this.recurrence?.type && this.recurrence.type !== "none") {
      if (!this.startTime || !this.endTime) {
        return next(
          new Error("startTime and endTime are required for recurring tasks")
        );
      }
      if (!this.recurrence.until) {
        return next(
          new Error("recurrence.until is required for recurring tasks")
        );
      }
    }
  }

  next();
});

module.exports = mongoose.model("Task", TaskSchema);
