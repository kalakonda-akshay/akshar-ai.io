# 📚 e-Pathasala — Digital Learning Platform for B.Tech Students

A feature-rich Electron desktop application designed specifically for B.Tech students.

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+ ([download here](https://nodejs.org))
- npm (included with Node.js)
- An OpenAI API key (optional but recommended for AI features)

---

## 📦 Installation

```bash
# Step 1: Navigate to the project folder
cd e-pathasala

# Step 2: Install all dependencies
npm install

# Step 3: Start the application
npm start
```

> **Note:** `npm start` launches both the Express backend (port 3847) and the Electron app simultaneously.

---

## 🔑 Default Login Credentials

| Username | Password   | Role    |
|----------|-----------|---------|
| admin    | admin123  | Admin   |
| student  | pass123   | Student |
| demo     | demo      | Student |

---

## ✨ Features

### 1. 🔐 User Authentication
- Login with username/password
- Secure session management via Electron IPC

### 2. 🏠 Dashboard
- Real-time stats (days to exam, quizzes taken, best score)
- Quick-access feature cards
- Dark theme with glassmorphism

### 3. 📅 Exam Planner
- Enter number of days until exam
- Select subjects to include
- AI generates day-wise study plan with sessions, topics, and tips

### 4. 🧠 Quiz Arena
- 6 subjects: Linear Algebra, Discrete Math, UID, Modern Physics, ADM, OOPS
- 25 MCQ questions per quiz
- 30-second countdown timer per question
- Score tracking and grade calculation

### 5. 📄 PDF Summarizer
- Upload PDF, DOCX, or TXT files
- AI extracts key points, important concepts, and exam tips
- Word count analysis

### 6. 💬 AI Doubt Solver
- ChatGPT-like interface
- Full conversation history
- Quick-question shortcuts
- Specialized for B.Tech subjects

### 7. 📚 Resource Library
- Upload and store study materials
- Supports PDF, DOCX, PPTX, TXT
- Persistent storage in user data directory

### 8. 🌐 Multi-language Support
- 8 languages: English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali

---

## 🤖 AI Configuration

1. Open the app and log in
2. Go to **Settings** in the sidebar
3. Enter your OpenAI API key (starts with `sk-...`)
4. Click **Save**

All AI features will now work:
- AI-generated study plans
- Dynamic quiz questions
- PDF summarization
- Doubt solving chatbot

**Without API key:** The app uses intelligent fallback responses for all features.

---

## 📁 Project Structure

```
e-pathasala/
├── package.json               # Dependencies & scripts
├── src/
│   ├── main/
│   │   └── main.js            # Electron main process
│   └── renderer/
│       ├── pages/
│       │   ├── login.html     # Login screen
│       │   └── dashboard.html # Main app (all views)
│       └── styles/
│           └── global.css     # Shared design system
├── backend/
│   └── server.js              # Express API server
└── README.md
```

---

## 🛠 Tech Stack

| Layer        | Technology               |
|--------------|--------------------------|
| Desktop      | Electron 28              |
| Frontend     | HTML5, CSS3, JavaScript  |
| Backend      | Node.js + Express        |
| AI           | OpenAI GPT-3.5-turbo     |
| File Parsing | pdf-parse, mammoth       |
| HTTP         | axios                    |

---

## 🐛 Troubleshooting

**App starts but AI features don't work:**
- Make sure you've added your OpenAI API key in Settings

**Backend connection error:**
- The Express server runs on port 3847
- Make sure no other app is using that port
- Try running `node backend/server.js` separately

**File upload fails:**
- Ensure the file is not corrupted
- Check file size (max 50MB)

---

## 📝 License
MIT License — Built for educational purposes
