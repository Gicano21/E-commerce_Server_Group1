const express = require("express");
const { Resend } = require("resend"); // Use Resend instead of Nodemailer
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.json');

const resend = new Resend("re_Ca7d2Zf2_ASQk7Nu8F78YPtxFVTRZZjnm");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));

const users = [];

app.post("/register", async (req, res) => {
  try {
    const { Email } = req.body; 
    const token = uuidv4();
    const code = (Math.floor(Math.random() * 9000) + 1000).toString();

    // ✅ FIXED: Dynamic URL for online hosting
    const host = req.get('host');
    const protocol = req.protocol;
    const verifyLink = `${protocol}://${host}/verify/${token}`;

    const { data, error } = await resend.emails.send({
      from: 'Tech Store <techstore.developers.com>', // Use this default for testing
      to: Email,
      subject: "Verify your email",
      html: `<div style="text-align: center; background-color: navy; color: white; border-radius: 5%">
<h1>Tech Store Verification</h1>
<h2>Pasensya na, trabaho lang</h2>
<h4>Sinabi ng isang binatilyo nang mahuling nag-papanggap umano na siya'y tuli na pero di pa pala</h4>
<img src="https://scontent.fmnl45-1.fna.fbcdn.net/v/t1.15752-9/667943570_924182237277544_1998740803774188928_n.jpg?_nc_cat=100&ccb=1-7&_nc_sid=9f807c&_nc_ohc=I0k4dyZ-q14Q7kNvwFoX6VU&_nc_oc=Ado43PmjGsC6z8tzkHmFKTvy3IfNWabCxdpo7p7C2M630B454QzBC5d5GjhskID-mGolK2ffpNT2pIxxCJRtxHNP&_nc_zt=23&_nc_ht=scontent.fmnl45-1.fna&_nc_ss=7a3a8&oh=03_Q7cD5AFsVLmOzYLM2b-hSWa00TobOn8cmeSfJZY55x1vNmIFdA&oe=6A0038E5" width="200" height="200">
<h3>Your verification code is: <b>${code}</b></h3>
             <p>Or click here: <a href="${verifyLink}">Verify Account</a></p>
             
             </div>`
    });

    if (error) {
      console.error("Resend Error:", error);
      return res.status(400).json({ error });
    }

    res.json({ message: code });
    console.log(`Email sent via Resend to ${Email}. Code: ${code}`);
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: "Failed to process registration" });
  }
});

// --- Database Helpers ---

// Initialize JSON file if it doesn't exist
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], version: "1.0.0" }, null, 2));
}

// Database Read/Write Helpers
const readDB = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const writeDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
const generateUserId = () => `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// --- Routes ---

// Get all users (Debug)
app.get('/api/users', (req, res) => {
  res.json(readDB().users);
});

// Search user by email or username
app.get('/api/users/search', (req, res) => {
  const db = readDB();
  const { email, username } = req.query;
  
  const user = db.users.find(u => {
    if (email && u.email.toLowerCase() === email.toLowerCase()) return true;
    if (username && u.username.toLowerCase() === username.toLowerCase()) return true;
    return false;
  });
  
  user ? res.json(user) : res.status(404).json(null);
});

// Create User
app.post('/api/users', (req, res) => {
  const db = readDB();
  const { username, email, password } = req.body;
  
  const exists = db.users.find(u => u.email.toLowerCase() === email.toLowerCase() || u.username.toLowerCase() === username.toLowerCase());
  if (exists) return res.status(400).json({ error: "User exists" });

  const newUser = { id: generateUserId(), username, email: email.toLowerCase(), password, createdAt: new Date().toISOString(), cart: [] };
  db.users.push(newUser);
  writeDB(db);
  res.json(newUser);
});

// Authenticate
app.post('/api/auth', (req, res) => {
  const user = readDB().users.find(u => u.email.toLowerCase() === req.body.email.toLowerCase() && u.password === req.body.password);
  user ? res.json(user) : res.status(401).json(null);
});

// Get User by ID
app.get('/api/users/:id', (req, res) => {
  const user = readDB().users.find(u => u.id === req.params.id);
  user ? res.json(user) : res.status(404).json(null);
});

// Update User
app.patch('/api/users/:id', (req, res) => {
  const db = readDB();
  const index = db.users.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).send();
  
  db.users[index] = { ...db.users[index], ...req.body, id: db.users[index].id, createdAt: db.users[index].createdAt };
  writeDB(db);
  res.json(db.users[index]);
});

// Delete User
app.delete('/api/users/:id', (req, res) => {
  const db = readDB();
  const initialLength = db.users.length;
  db.users = db.users.filter(u => u.id !== req.params.id);
  if (db.users.length === initialLength) return res.status(404).send();
  writeDB(db);
  res.json({ success: true });
});

// Add to Cart
app.post('/api/users/:id/cart', (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).send();

  const item = req.body;
  const existingItem = user.cart.find(i => i.id === item.id);
  
  if (existingItem) existingItem.quantity += item.quantity;
  else user.cart.push(item);

  writeDB(db);
  res.json({ success: true });
});

// Update Cart Item Quantity
app.patch('/api/users/:id/cart/:itemId', (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).send();

  const item = user.cart.find(i => i.id == req.params.itemId);
  if (!item) return res.status(404).send();
  
  item.quantity = req.body.quantity;
  writeDB(db);
  res.json({ success: true });
});

// Remove from Cart
app.delete('/api/users/:id/cart/:itemId', (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).send();
  
  user.cart = user.cart.filter(i => i.id != req.params.itemId);
  writeDB(db);
  res.json({ success: true });
});

// Clear Entire Cart
app.delete('/api/users/:id/cart', (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).send();
  
  user.cart = [];
  writeDB(db);
  res.json({ success: true });
});

// Clear Database (Debug)
app.post('/api/database/clear', (req, res) => {
  writeDB({ users: [], version: "1.0.0" });
  res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});