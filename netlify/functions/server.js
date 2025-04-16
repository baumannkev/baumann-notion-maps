require("dotenv").config();
const express = require("express");
const app = express();
const serverless = require("serverless-http");
const fetch = require("node-fetch");
const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_KEY });

app.use(express.json());

// ─── New: Get database schema (properties) ───────────────────────────
app.get("/api/databases/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const db = await notion.databases.retrieve({ database_id: id });
    // Return only the properties object
    res.json({ success: true, properties: db.properties });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── List databases ────────────────────────────────────────────────────
app.get("/api/databases", async (req, res) => {
  try {
    const response = await notion.search({
      filter: { property: "object", value: "database" },
    });
    let dbs = response.results.filter((db) => !db.archived);
    const seen = new Set();
    dbs = dbs.filter((db) => {
      if (seen.has(db.id)) return false;
      seen.add(db.id);
      return true;
    });
    res.json({ success: true, results: dbs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Pages in a database ───────────────────────────────────────────────
app.get("/api/databases/:id/pages", async (req, res) => {
  const { id } = req.params;
  try {
    const response = await notion.databases.query({ database_id: id });
    res.json({ success: true, results: response.results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Geocode endpoint ─────────────────────────────────────────────────
app.get("/api/geocode", async (req, res) => {
  const address = req.query.address;
  if (!address) {
    return res
      .status(400)
      .json({ success: false, message: "Missing address parameter" });
  }
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&q=" +
      encodeURIComponent(address);
    const geoRes = await fetch(url);
    const geoData = await geoRes.json();
    if (geoData.length > 0) {
      const { lat, lon } = geoData[0];
      res.json({ success: true, lat, lon });
    } else {
      res.json({ success: false, message: "No results found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── Other existing routes (databases.create, pages.create, etc.) ────
// ... (your existing /databases, /pages, /blocks, /comments routes here)

module.exports.handler = serverless(app);
