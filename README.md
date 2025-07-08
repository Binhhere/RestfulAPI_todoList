# hydra-API_server

# 🧾 To-Do List RESTful API

A full-featured **Express.js** RESTful API for managing a to-do list system with robust **user authentication**, **task management**, **user account control**, and **interactive Swagger API documentation**. Built for backend training and intern onboarding.

---

## 🚀 Features

### 🔐 User Authentication & Management
- Register and login with JWT-based authentication
- View, update, and delete user profile
- All protected routes require a valid access token

### ✅ Task Management
- CRUD operations for tasks (title, description, due date, status)
- User-scoped data
- Validations and structured error messages

### 📄 Swagger API Docs
- 📍 Visit: `http://localhost:3000/api-docs`
- Auto-generated with `swagger-jsdoc`
- Fully interactive UI for testing routes and reviewing schemas

---

## 🧠 Learning Outcomes

This project is ideal for interns learning backend development:

- Build secure REST APIs with **Express.js**
- Implement **JWT authentication** and **authorization middleware**
- Connect to **MongoDB** 
- Apply **data validation** and **schema enforcement**
- Organize code using **MVC patterns**
- Set up and document APIs using **Swagger**
- Debug using status codes and server logs
- Follow modern **git workflow** and **branching standards**

---

## 🛠 Tech Stack

| Tool                | Purpose                               |
|---------------------|----------------------------------------|
| Node.js             | JavaScript backend runtime             |
| Express.js          | Web framework                         |
| MongoDB + Mongoose  | NoSQL DB + ODM                        |
| JWT                 | Auth token handling                   |
| bcryptjs            | Secure password hashing               |
| express-validator   | Input validation middleware           |
| swagger-jsdoc       | Swagger/OpenAPI spec generator        |
| swagger-ui-express  | Swagger UI for route docs             |

---

## 📦 Installation

```bash
git clone https://github.com/<your-username>/todo-api-server.git
cd todo-api-server
npm install
