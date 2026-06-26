'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const axios = require('axios');

// File paths for local fallback database
const USERS_FILE = path.join(__dirname, 'users.json');
const LOGS_FILE = path.join(__dirname, 'logs.json');

// MONGODB CONNECTION & REMOTE CONFIG
const mongoUri = process.env.MONGODB_URI;
const REMOTE_API = 'https://akshar-ai-io.vercel.app';
let isMongo = false;

if (mongoUri) {
  console.log('Attempting to connect to MongoDB...');
  mongoose.connect(mongoUri)
    .then(() => {
      console.log('✅ Connected to MongoDB successfully.');
      isMongo = true;
    })
    .catch(err => {
      console.error('❌ MongoDB connection error, falling back to local files:', err.message);
      isMongo = false;
    });
} else {
  console.log('ℹ️ Local Mode: Forwarding auth and logging to remote server:', REMOTE_API);
}

// ── MONGO SCHEMAS & MODELS ────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, default: 'B.Tech Student' },
  branch: { type: String, default: '' },
  college: { type: String, default: '' },
  year: { type: String, default: '' },
  avatar: { type: String, default: '👨‍🎓' },
  createdAt: { type: Date, default: Date.now }
});

const logSchema = new mongoose.Schema({
  username: { type: String, default: 'anonymous' },
  ip: { type: String, default: '' },
  action: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  timestamp: { type: Date, default: Date.now }
});

const MongoUser = mongoose.models.User || mongoose.model('User', userSchema);
const MongoLog = mongoose.models.Log || mongoose.model('Log', logSchema);

// ── BUILT-IN USERS ─────────────────────────────────────────────────────────────
const builtInUsers = {
  student: { password: 'pass123',  name: 'Alex Kumar',  role: 'B.Tech Student', branch: 'CSE', college: 'Anna University', year: '3rd Year', avatar: '👨‍🎓' },
  admin:   { password: 'admin123', name: 'Admin User',  role: 'Administrator',  branch: '',    college: '',                year: '',         avatar: '👨‍💻' },
  demo:    { password: 'demo',     name: 'Demo User',   role: 'B.Tech Student', branch: 'IT',  college: 'VTU',             year: '2nd Year', avatar: '🎓'  }
};

// ── EXPORTED DATABASE INTERFACE ─────────────────────────────────────────────────
module.exports = {
  // Save a new user
  async registerUser(userData) {
    // If running in cloud (Vercel)
    if (mongoUri && isMongo) {
      const { username, password, name, role, branch, college, year, avatar } = userData;
      const cleanUsername = username.toLowerCase().trim();
      const hashedPassword = bcrypt.hashSync(password, 10);

      const existing = await MongoUser.findOne({ username: cleanUsername });
      if (existing) {
        throw new Error('Username already taken.');
      }
      const user = new MongoUser({
        username: cleanUsername,
        password: hashedPassword,
        name: name.trim(),
        role,
        branch,
        college,
        year,
        avatar
      });
      await user.save();
      return { username: cleanUsername, name: user.name };
    } 
    // If running locally in Electron (forward to Vercel API)
    else {
      try {
        const response = await axios.post(`${REMOTE_API}/register`, userData);
        if (response.data && response.data.ok) {
          return response.data;
        } else {
          throw new Error(response.data.error || 'Registration failed');
        }
      } catch (err) {
        throw new Error(err.response?.data?.error || err.message);
      }
    }
  },

  // Authenticate user
  async loginUser(username, password) {
    const cleanUsername = username.toLowerCase().trim();

    // If running in cloud (Vercel)
    if (mongoUri && isMongo) {
      const user = await MongoUser.findOne({ username: cleanUsername });
      if (user) {
        const match = bcrypt.compareSync(password, user.password);
        if (match) {
          return {
            username: cleanUsername,
            name: user.name,
            role: user.role,
            branch: user.branch,
            college: user.college,
            year: user.year,
            avatar: user.avatar
          };
        }
      }

      // Check built-in users on cloud fallback
      const builtIn = builtInUsers[cleanUsername];
      if (builtIn && password === builtIn.password) {
        return { username: cleanUsername, ...builtIn };
      }
      throw new Error('Wrong username or password');
    } 
    // If running locally in Electron (forward to Vercel API)
    else {
      try {
        const response = await axios.post(`${REMOTE_API}/login`, { username, password });
        if (response.data && response.data.ok) {
          return response.data.user;
        } else {
          throw new Error(response.data.error || 'Login failed');
        }
      } catch (err) {
        throw new Error(err.response?.data?.error || err.message);
      }
    }
  },

  // Log user activity
  async logActivity(username, action, ip, details = null) {
    const cleanUsername = username ? username.toLowerCase().trim() : 'anonymous';
    const logEntry = {
      username: cleanUsername,
      ip: ip || 'unknown',
      action,
      details,
      timestamp: new Date()
    };

    // If running in cloud (Vercel)
    if (mongoUri && isMongo) {
      try {
        const log = new MongoLog(logEntry);
        await log.save();
      } catch (e) {
        console.error('Failed to save log to MongoDB:', e.message);
      }
    } 
    // If running locally in Electron (forward to Vercel API)
    else {
      try {
        await axios.post(`${REMOTE_API}/log-activity`, logEntry);
      } catch (e) {
        console.error('Failed to forward log to Vercel API:', e.message);
      }
    }
  },

  // Get active logs
  async getLogs(limit = 100) {
    // If running in cloud (Vercel)
    if (mongoUri && isMongo) {
      return await MongoLog.find().sort({ timestamp: -1 }).limit(limit);
    } 
    // If running locally in Electron (forward to Vercel API)
    else {
      try {
        const response = await axios.post(`${REMOTE_API}/logs`, { username: 'admin' });
        if (response.data && response.data.ok) {
          return response.data.logs;
        }
        return [];
      } catch (err) {
        console.error('Failed to retrieve logs from Vercel API:', err.message);
        return [];
      }
    }
  }
};
