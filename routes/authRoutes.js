const express = require('express');
const { registerUser, loginUser } = require('../controllers/authController');

const router = express.Router();

// Route register
router.post('/register', registerUser);

// Route login
router.post('/login', loginUser);

module.exports = router;
