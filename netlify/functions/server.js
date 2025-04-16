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

// Get a list of databases (deduplicated and non-archived)
app.get("/api/databases", async (req, res) => {
  try {
    let response = await notion.search({
      filter: {
        property: "object",
        value: "database",
      },
    });
    // Filter out archived databases
    let dbs = response.results.filter((db) => !db.archived);
    // Deduplicate by database id
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

// Get pages inside a specific database
app.get("/api/databases/:id/pages", async (req, res) => {
  const { id } = req.params;
  try {
    const response = await notion.databases.query({ database_id: id });
    res.json({ success: true, results: response.results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Geocode an address using Nominatim (OpenStreetMap)
app.get("/api/geocode", async (req, res) => {
  const address = req.query.address;
  if (!address) {
    return res
      .status(400)
      .json({ success: false, message: "Missing address parameter" });
  }
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        address
      )}`
    );
    const geoData = await geoRes.json();
    if (geoData.length > 0) {
      const firstResult = geoData[0];
      res.json({ success: true, lat: firstResult.lat, lon: firstResult.lon });
    } else {
      res.json({ success: false, message: "No results found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a new database (using a specified page as parent)
app.post("/databases", async (req, res) => {
  const pageId = process.env.NOTION_PAGE_ID;
  const title = req.body.dbName;
  try {
    const newDb = await notion.databases.create({
      parent: {
        type: "page_id",
        page_id: pageId,
      },
      title: [
        {
          type: "text",
          text: {
            content: title,
          },
        },
      ],
      properties: {
        Name: {
          title: {},
        },
      },
    });
    res.json({ message: "success!", data: newDb });
  } catch (error) {
    res.json({ message: "error", error });
  }
});

// Create a new page inside a database
app.post("/pages", async (req, res) => {
  const { dbID, pageName, header } = req.body;
  try {
    const newPage = await notion.pages.create({
      parent: {
        type: "database_id",
        database_id: dbID,
      },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: pageName,
              },
            },
          ],
        },
      },
      children: [
        {
          object: "block",
          heading_2: {
            rich_text: [
              {
                text: {
                  content: header,
                },
              },
            ],
          },
        },
      ],
    });
    res.json({ message: "success!", data: newPage });
  } catch (error) {
    res.json({ message: "error", error });
  }
});

// Append a block (content) to a page
app.post("/blocks", async (req, res) => {
  const { pageID, content } = req.body;
  try {
    const newBlock = await notion.blocks.children.append({
      block_id: pageID,
      children: [
        {
          paragraph: {
            rich_text: [
              {
                text: {
                  content: content,
                },
              },
            ],
          },
        },
      ],
    });
    res.json({ message: "success!", data: newBlock });
  } catch (error) {
    res.json({ message: "error", error });
  }
});

// Add a comment to a page
app.post("/comments", async (req, res) => {
  const { pageID, comment } = req.body;
  try {
    const newComment = await notion.comments.create({
      parent: {
        page_id: pageID,
      },
      rich_text: [
        {
          text: {
            content: comment,
          },
        },
      ],
    });
    res.json({ message: "success!", data: newComment });
  } catch (error) {
    res.json({ message: "error", error });
  }
});

// Export the Express app wrapped in a Netlify function handler.
module.exports.handler = serverless(app);
