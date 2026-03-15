# ⬡ QuantumDo — Task Dimension

A next-generation Todo App with **Node.js + Express + MongoDB** backend and a jaw-dropping dark UI.

---

## 🚀 Features

- **Full MongoDB persistence** — every task stored with timestamps, priorities, categories, tags, notes, due dates
- **Live DB status indicator** — shows MongoDB connection in real-time
- **Rich task model** — priority levels, categories, tags, notes, due dates, order
- **Smart filters** — All / Pending / Completed / High Priority + real-time search
- **Bulk operations** — clear all completed in one click
- **Edit modal** — fully edit any task field
- **Progress bar** — visual completion percentage
- **Stats dashboard** — total, completed, pending, high-priority counts
- **Toast notifications** — success/error feedback
- **Overdue detection** — highlights tasks past due date

---

## 📁 Project Structure

```
todo-app/
├── server.js          ← Express app entry point
├── .env               ← Environment variables
├── package.json
├── models/
│   └── Todo.js        ← Mongoose schema
├── routes/
│   └── todos.js       ← All REST API routes
└── public/
    └── index.html     ← Frontend (HTML + CSS + JS)
```

---

## ⚙️ Setup & Run

### 1. Install dependencies
```bash
npm install
```

### 2. Start MongoDB locally
```bash
# Make sure MongoDB is running on your machine
mongod
```

### 3. Configure environment (optional)
Edit `.env` to change port or use MongoDB Atlas:
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/quantumtodo
# Atlas:
# MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/quantumtodo
```

### 4. Start the server
```bash
npm start
# or for auto-reload during development:
npm run dev
```

### 5. Open in browser
```
http://localhost:3000
```

---

## 🔌 REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/todos | Get all todos (with stats) |
| GET    | /api/todos?completed=true | Filter by status |
| GET    | /api/todos?priority=high | Filter by priority |
| GET    | /api/todos?search=keyword | Search tasks |
| POST   | /api/todos | Create a new todo |
| PUT    | /api/todos/:id | Update a todo |
| PATCH  | /api/todos/:id/toggle | Toggle complete |
| DELETE | /api/todos/:id | Delete a todo |
| DELETE | /api/todos/bulk/completed | Delete all completed |
| PATCH  | /api/todos/bulk/reorder | Reorder tasks |
| GET    | /api/health | DB health check |

---

## 🧩 Todo Schema (MongoDB)

```js
{
  text:      String,   // task content
  completed: Boolean,  // done?
  priority:  String,   // 'low' | 'medium' | 'high'
  category:  String,   // e.g. "Work", "Personal"
  dueDate:   Date,
  tags:      [String],
  notes:     String,
  order:     Number,
  createdAt: Date,     // auto
  updatedAt: Date,     // auto
}
```

---

## 🛠 Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB + Mongoose ODM
- **Frontend**: Vanilla HTML/CSS/JS (no framework needed)
- **Fonts**: Syne + Space Mono (Google Fonts)
