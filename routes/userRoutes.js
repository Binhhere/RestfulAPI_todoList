const express = require("express");
const router = express.Router();
const {
  getProfile,
  updateProfile,
  deleteProfile,
} = require("../controllers/userProfileController");
const verifyToken = require("../middlewares/authMiddleware");

router.use(verifyToken);

router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.delete("/profile", deleteProfile);

module.exports = router;
