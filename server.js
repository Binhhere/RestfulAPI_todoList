const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const taskRoutes = require("./routes/taskRoutes");
const setupSwagger = require("./swagger");
const userRoutes = require("./routes/userRoutes");
const globalErrorHandler = require("./middleware/globalErrorHandler");

dotenv.config();

const app = express();

connectDB();

// Middleware
app.use(express.json());
app.use(cors());
app.use(helmet());
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/users", userRoutes);

// Swagger
setupSwagger(app);

// Global Error Handler
app.use(globalErrorHandler);

// Test route
app.get("/", (req, res) => {
  res.send("API is running...");
});

// 404 Handler 
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.MODE} mode on port ${PORT}`);
});
