const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const VIEWS_DIR = path.join(__dirname, "views");

// Answer-key JSON files and the browser script that renders them
app.use("/data", express.static(path.join(__dirname, "data")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

// Home page
app.get("/", (req, res) => {
  res.sendFile(path.join(VIEWS_DIR, "index.html"));
});

// Year page, e.g. /2026
app.get("/:year", (req, res, next) => {
  const { year } = req.params;
  if (!/^\d{4}$/.test(year)) return next();

  const file = path.join(VIEWS_DIR, `${year}.html`);
  if (!fs.existsSync(file)) return next();

  res.sendFile(file);
});

// 404
app.use((req, res) => {
  res.status(404).send("Página não encontrada");
});

app.listen(PORT, () => {
  console.log(`EnemGabas rodando em http://localhost:${PORT}`);
});
