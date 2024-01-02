require("dotenv").config();
const express = require("express");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public folder
const { v4: uuidv4 } = require("uuid");
app.use(express.static("public"));

const Parser = require("rss-parser");
const parser = new Parser();
const { AceBase } = require("acebase");
const db = new AceBase("rss-aggregator");

db.ready(() => {
  console.log("AceBase database is ready to use");
});

const port = process.env.PORT || 3000;

// Post to add RSS feed
app.post("/add", async (req, res) => {
  try {
    let url = req.body.url;
    let feed = await parser.parseURL(url);
    feed.id = uuidv4();
    feed.url = url;

    // Check if feed already exists in the database
    const existingFeed = await db.ref(`feeds/${feed.id}`).get();
    if (!existingFeed.exists()) {
      // Save new feed to the database
      await db.ref(`feeds/${feed.id}`).set(feed);
      res.json(feed); // Send back the added feed as a response
    } else {
      res.status(400).send("Feed already exists");
    }
  } catch (error) {
    res.status(500).send("Error parsing RSS feed");
  }
});

// Get all RSS feeds
app.get("/rss", async (req, res) => {
  const feedsSnapshot = await db.ref("feeds").get();
  const feeds = feedsSnapshot.val();
  if (!feeds) {
    return res.status(404).send("No feeds found");
  }
  return res.json(
    Object.values(feeds).map((feed) => ({
      id: feed.id,
      title: feed.title,
      link: feed.link,
    }))
  );
});

// Get specific feed by ID
app.get("/feed/:id", async (req, res) => {
  let id = req.params.id;
  const feedSnapshot = await db.ref(`feeds/${id}`).get();
  if (feedSnapshot.exists()) {
    let feed = feedSnapshot.val();
    try {
      let parsedFeed = await parser.parseURL(feed.url);
      res.json(parsedFeed);
    } catch (error) {
      res.status(500).send("Error parsing RSS feed");
    }
  } else {
    res.status(404).send("Feed not found");
  }
});

app.listen(port, () => {
  console.log(`RSS Aggregator running at http://localhost:${port}`);
});
