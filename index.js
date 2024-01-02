require("dotenv").config();
const cheerio = require("cheerio");
const express = require("express");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    const url = req.body.url;
    const feed = await parser.parseURL(url);
    const feedsSnapshot = await db.ref("feeds").get();
    const feeds = feedsSnapshot.val() || {};

    // Check if feed url already exists
    if (Object.values(feeds).some((f) => f.url === url)) {
      return res.status(400).send("Feed already exists");
    }

    const feedId = uuidv4();
    const newFeed = {
      id: feedId,
      title: feed.title,
      link: feed.link,
      url: feed.feedUrl || url, // Some RSS feeds might not have a feedUrl
    };

    // Add feed to database
    await db.ref(`feeds/${feedId}`).set(newFeed);
    res.json(newFeed);
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
app.get("/feed/scrape/:id", async (req, res) => {
  let id = req.params.id;
  const feedSnapshot = await db.ref(`feeds/${id}`).get();

  if (!feedSnapshot.exists()) {
    return res.status(404).send("Feed not found");
  }

  let feed = feedSnapshot.val();

  try {
    let parsedFeed = await parser.parseURL(feed.url);
    const links = parsedFeed.items.map((item) => item.link);
    const scrapedData = [];

    for (const link of links) {
      let lastIndexOfHttps = link.lastIndexOf("https");
      let newLink = link.slice(lastIndexOfHttps);
      console.log(newLink);
      const response = await fetch(newLink);
      const body = await response.text();
      console.log(body);
      const $ = cheerio.load(body);
      // Example: scraping all paragraph texts from the page
      const pageText = $("p").text();
      scrapedData.push({ link, pageText });
    }

    res.json(scrapedData);
  } catch (error) {
    res.status(500).send("Error scraping the feed: " + error.message);
  }
});

app.listen(port, () => {
  console.log(`RSS Aggregator running at http://localhost:${port}`);
});
