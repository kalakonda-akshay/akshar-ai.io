'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// File paths for local fallback database
const USERS_FILE = path.join(__dirname, 'users.json');
const LOGS_FILE = path.join(__dirname, 'logs.json');

// MONGODB CONNECTION
const mongoUri = process.env.MONGODB_URI;
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
  console.log('ℹ️ No MONGODB_URI environment variable found. Using local JSON files.');
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

// ── BUILT-IN USERS (PLAINTEXT IN CODE, SECURED ON VERIFICATION) ─────────────────
const builtInUsers = {
  student: { password: 'pass123',  name: 'Alex Kumar',  role: 'B.Tech Student', branch: 'CSE', college: 'Anna University', year: '3rd Year', avatar: '👨‍🎓' },
  admin:   { password: 'admin123', name: 'Admin User',  role: 'Administrator',  branch: '',    college: '',                year: '',         avatar: '👨‍💻' },
  demo:    { password: 'demo',     name: 'Demo User',   role: 'B.Tech Student', branch: 'IT',  college: 'VTU',             year: '2nd Year', avatar: '🎓'  }
};

// ── HELPER FUNCTIONS FOR LOCAL JSON DB ──────────────────────────────────────────
function readLocalUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    // Write empty users file
    fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
    return {};
  }
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading local users.json:', e.message);
    return {};
  }
}

function writeLocalUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Error writing local users.json:', e.message);
  }
}

function writeLocalLog(logEntry) {
  try {
    let logs = [];
    if (fs.existsSync(LOGS_FILE)) {
      try {
        logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
        if (!Array.isArray(logs)) logs = [];
      } catch {}
    }
    logs.push(logEntry);
    // Limit to last 5000 logs locally
    if (logs.length > 5000) logs.shift();
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
  } catch (e) {
    console.error('Error writing local logs.json:', e.message);
  }
}

// ── EXPORTED DATABASE INTERFACE ─────────────────────────────────────────────────
module.exports = {
  // Save a new user (with hashed password)
  async registerUser(userData) {
    const { username, password, name, role, branch, college, year, avatar } = userData;
    const cleanUsername = username.toLowerCase().trim();
    const hashedPassword = bcrypt.hashSync(password, 10);

    if (isMongo) {
      // Check if user exists
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
    } else {
      const users = readLocalUsers();
      if (users[cleanUsername] || builtInUsers[cleanUsername]) {
        throw new Error('Username already taken.');
      }
      users[cleanUsername] = {
        password: hashedPassword,
        name: name.trim(),
        role: role || 'B.Tech Student',
        branch: branch || '',
        college: college || '',
        year: year || '',
        avatar: avatar || '👨‍🎓'
      };
      writeLocalUsers(users);
      return { username: cleanUsername, name: users[cleanUsername].name };
    }
  },

  // Authenticate user
  async loginUser(username, password) {
    const cleanUsername = username.toLowerCase().trim();

    // Check MongoDB first if connected
    if (isMongo) {
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
    } else {
      // Check Local File Users
      const users = readLocalUsers();
      const user = users[cleanUsername];
      if (user) {
        // Support legacy plaintext passwords in users.json or hashed passwords
        let match = false;
        if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
          match = bcrypt.compareSync(password, user.password);
        } else {
          // If plaintext, match directly and upgrade password to hash
          match = (password === user.password);
          if (match) {
            user.password = bcrypt.hashSync(password, 10);
            writeLocalUsers(users);
          }
        }
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
    }

    // Fallback to built-in users (if not matched or not found in DB)
    const builtIn = builtInUsers[cleanUsername];
    if (builtIn && password === builtIn.password) {
      return {
        username: cleanUsername,
        ...builtIn
      };
    }

    throw new Error('Wrong username or password');
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

    if (isMongo && mongoose.connection.readyState === 1) {
      try {
        const log = new MongoLog(logEntry);
        await log.save();
      } catch (e) {
        console.error('Failed to save log to MongoDB, saving locally:', e.message);
        writeLocalLog(logEntry);
      }
    } else {
      writeLocalLog(logEntry);
    }
  },

  // Get active logs (for analytics/admin tracking)
  async getLogs(limit = 100) {
    if (isMongo) {
      return await MongoLog.find().sort({ timestamp: -1 }).limit(limit);
    } else {
      if (!fs.existsSync(LOGS_FILE)) return [];
      try {
        const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
        return Array.isArray(logs) ? logs.reverse().slice(0, limit) : [];
      } catch {
        return [];
      }
    }
  }
};
