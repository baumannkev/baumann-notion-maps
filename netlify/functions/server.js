// ✅ FIXED: Fully working serverless setup for Netlify + Notion API + Geocoding
// Place this file at: netlify/functions/server.js

require("dotenv").config();
const express = require("express");
const app = express();
const serverless = require("serverless-http");
const fetch = require("node-fetch");
const { Client } = require("@notionhq/client");

// Initialize Notion client using your integration token
const notion = new Client({ auth: process.env.NOTION_KEY });

app.use(express.json());

// ------------------ API Endpoints ------------------ //

app.get("/api/databases", async (req, res) => {
  try {
    const response = await notion.search({
      filter: {
        property: "object",
        value: "database",
      },
    });
    const dbs = Array.from(new Set(response.results.filter(db => !db.archived)));
    res.json({ success: true, results: dbs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/databases/:id/pages", async (req, res) => {
  try {
    const response = await notion.databases.query({ database_id: req.params.id });
    res.json({ success: true, results: response.results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/geocode", async (req, res) => {
  const address = req.query.address;
  if (!address) return res.status(400).json({ success: false, message: "Missing address parameter" });

  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`
    );
    const geoData = await geoRes.json();
    if (geoData.length > 0) {
      const first = geoData[0];
      res.json({ success: true, lat: first.lat, lon: first.lon });
    } else {
      res.json({ success: false, message: "No results found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Optional: Disable or remove these if not used in frontend.
app.post("/databases", async (req, res) => {
  try {
    const newDb = await notion.databases.create({
      parent: { type: "page_id", page_id: process.env.NOTION_PAGE_ID },
      title: [{ type: "text", text: { content: req.body.dbName } }],
      properties: { Name: { title: {} } },
    });
    res.json({ message: "success", data: newDb });
  } catch (error) {
    res.json({ message: "error", error });
  }
});

app.post("/pages", async (req, res) => {
  try {
    const { dbID, pageName, header } = req.body;
    const newPage = await notion.pages.create({
      parent: { type: "database_id", database_id: dbID },
      properties: {
        Name: {
          title: [{ text: { content: pageName } }]
        }
      },
      children: [
        {
          object: "block",
          heading_2: {
            rich_text: [{ text: { content: header } }],
          },
        },
      ],
    });
    res.json({ message: "success", data: newPage });
  } catch (error) {
    res.json({ message: "error", error });
  }
});

app.post("/comments", async (req, res) => {
  try {
    const { pageID, comment } = req.body;
    const newComment = await notion.comments.create({
      parent: { page_id: pageID },
      rich_text: [{ text: { content: comment } }],
    });
    res.json({ message: "success", data: newComment });
  } catch (error) {
    res.json({ message: "error", error });
  }
});

module.exports.handler = serverless(app);
