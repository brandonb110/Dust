const express = require("express");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

app.get("/api/verify", async (req, res) => {
  try {
    const verifyUrl = req.query.url;

    if (!verifyUrl || !verifyUrl.startsWith("https://giveaways.random.org/verify/")) {
      return res.status(400).json({ error: "Please enter a valid RANDOM.ORG giveaway verify link." });
    }

    const response = await fetch(verifyUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 CashCalculatorBot"
      }
    });

    if (!response.ok) {
      return res.status(500).json({ error: "Could not load RANDOM.ORG verify page." });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let pageText = $("body").text()
      .replace(/\r/g, "\n")
      .replace(/\t/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();

    let winners = [];

    $("ol li, ul li").each((i, el) => {
      const txt = $(el).text().trim().replace(/\s+/g, " ");
      if (txt && txt.length < 120) winners.push(txt);
    });

    if (winners.length === 0) {
      const lines = pageText.split("\n").map(x => x.trim()).filter(Boolean);

      const startWords = ["Winners", "Winner", "Results", "Prizes"];
      let start = lines.findIndex(line => startWords.some(w => line.toLowerCase().includes(w.toLowerCase())));

      if (start >= 0) {
        winners = lines.slice(start + 1)
          .filter(line => line && !line.toLowerCase().includes("random.org"))
          .filter(line => line.length < 120)
          .slice(0, 200);
      }
    }

    winners = winners
      .map(w => w.replace(/^\d+[\).\-\s]+/, "").trim())
      .filter(w => w && !w.toLowerCase().includes("certificate"))
      .filter(w => w && !w.toLowerCase().includes("random.org"));

    res.json({
      verifyUrl,
      count: winners.length,
      winners,
      rawPreview: pageText.slice(0, 2000)
    });
  } catch (err) {
    res.status(500).json({ error: "Server error reading verify link.", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Cash calculator running on port ${PORT}`);
});
