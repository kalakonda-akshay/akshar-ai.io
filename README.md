# 📚 Akshar.ai — AI-Powered Academic Intelligence for B.Tech Students

[![Live Demo](https://img.shields.io/badge/Live-Production%20App-6d5dfc?style=for-the-badge)](https://akshar-ai-rho.vercel.app)
[![Platform](https://img.shields.io/badge/Platform-Web%20%2F%20Electron-00f0ff?style=for-the-badge)](#)
[![Deployment](https://img.shields.io/badge/Deployment-Vercel%20%26%20MongoDB-00ffaa?style=for-the-badge)](#)
[![AI Engine](https://img.shields.io/badge/AI-Groq%20Cloud-ffd700?style=for-the-badge)](#)

**Akshar.ai** is a premium, feature-rich academic intelligence portal designed to help engineering students accelerate their learning. It integrates custom curriculum structures, AI-powered study planners, automated mock quizzes, PDF summarizers, voice-note transcribers, and a specialized technical chatbot.

---

## 🚀 Quick Start (Production)

Access the live production deployment from any device (Desktop, Laptop, or Mobile):
👉 **[https://akshar-ai-rho.vercel.app](https://akshar-ai-rho.vercel.app)**

---

## 🔑 Default Credentials & Access

*   **To explore as an Administrator:**
    *   **Username:** `AKSHAY`
    *   **Password:** `RAM@6002`
*   **To explore as a Student:**
    *   Click the **Create Account** tab on the login screen.
    *   Choose your specific **Branch** (CSE or AI&DS) and **Semester** (1–4).
    *   Create your login, and the dashboard will automatically load your customized Amrita curriculum!

---

## ✨ Primary Features

### 🎓 1. Dynamic Amrita Vishwa Vidyapeetham Curricula
*   **Branch Filtering:** Custom templates for **Computer Science (CSE)** and **Artificial Intelligence & Data Science (AI&DS)**.
*   **Semester Filtering:** Directly filters course contents across semesters 1, 2, 3, and 4.
*   **Dynamic Synchronization:** Changing branches or semesters dynamically updates the study plan list and quiz cards across all views.

### 📅 2. Exam Planner
*   Configure days until exams and study hours per day.
*   AI generates a highly structured, day-wise timeline detailing session goals, recommended reading, and custom learning tips.

### 🧠 3. Interactive Quiz Arena
*   Loads dynamic 25-question MCQ pools tailored to each subject.
*   Includes a 30-second question timer, instant answer grading, and comprehensive explanation keys for wrong answers.

### 📄 4. AI Document Summarizer & OCR
*   **PDF Summarizer:** Upload textbook PDFs, DOCX, or TXT notes. The AI extracts definitions, core concepts, and potential exam questions.
*   **OCR Support:** Take snapshots of textbooks/slides and run high-accuracy OCR directly in-app to convert them into summarized study notes.

### 🎤 5. Lecture Voice Notes Summarizer
*   Record live lectures directly inside the app.
*   Transcribes spoken English and generates organized summaries.

### 💬 6. Academic Doubt Solver (Chatbot)
*   Specialized engineering tutor context that answers doubts with clean formatting, equations, and code blocks.

---

## 🛠 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | HTML5, JavaScript (ES6+), Modern Glassmorphic CSS3 |
| **Backend & Hosting** | Node.js + Express, Deployed Serverless via Vercel Cloud |
| **Database** | MongoDB Atlas Cloud Database (Mongoose Object Modeling) |
| **AI Engine** | Groq Cloud Llama-3-70B API |
| **OCR Process** | Tesseract.js v5 (JS Engine Wrapper) |
| **Desktop Wrapper** | Electron 28 (configured for production-cloud bridge) |

---

## 📦 Local Installation (Development)

To run the application locally on your computer:

```bash
# Clone the repository
git clone https://github.com/kalakonda-akshay/akshar-ai.io.git
cd akshar-ai.io

# Install dependencies
npm install

# Start the local Electron application & Express server
npm start
```

> [!NOTE]
> The app is pre-configured to automatically connect to the Vercel production API when running locally, so you don't need a local MongoDB setup to test client-side features.

---

## 📝 Project Architecture

```
akshar-ai/
├── package.json               # Package descriptors & commands
├── vercel.json                # Vercel Serverless routing config
├── backend/
│   ├── server.js              # Express REST API controller
│   └── database.js            # MongoDB & Mongoose Schemas
└── src/
    └── renderer/
        ├── pages/
        │   ├── login.html     # Portal Access Screen
        │   └── dashboard.html # Main Workstation (Single Page Application)
        ├── styles/
        │   └── global.css     # Premium UI Design System
        └── js/
            └── web-fallback.js# Cross-environment bridge APIs
```

---

## 📄 License
Licensed under the **MIT License** — Built for educational enhancement.
