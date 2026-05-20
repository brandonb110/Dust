const express = require("express");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

function cleanWinner(line) {
  return line
    .replace(/^\s*\d+\.\s*/, "")      // removes placement like "1."
    .replace(/^\s*\d+\.\s*/, "")      // removes entry number like "5."
    .replace(/\s+/g, " ")
    .trim();
}

app.get("/api/verify", async (req, res) => {
  try {
    const verifyUrl = req.query.url;

    if (!verifyUrl || !verifyUrl.startsWith("https://giveaways.random.org/verify/")) {
      return res.status(400).json({ error: "Please enter a valid RANDOM.ORG giveaway verify link." });
    }

    const response = await fetch(verifyUrl, {
      headers: { "User-Agent": "Mozilla/5.0 CashCalculatorBot" }
    });

    if (!response.ok) {
      return res.status(500).json({ error: "Could not load RANDOM.ORG verify page." });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const bodyText = $("body").text()
      .replace(/\r/g, "\n")
      .replace(/\t/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();

    const lines = bodyText.split("\n").map(x => x.trim()).filter(Boolean);

    const winners = [];
    const rounds = [];

    for (let i = 0; i < lines.length; i++) {
      const roundMatch = lines[i].match(/Result of Round #(\d+)/i);

      if (roundMatch) {
        const roundNumber = Number(roundMatch[1]);

        // The winner is the #1 result immediately after the round heading.
        for (let j = i + 1; j < lines.length; j++) {
          const nextRound = lines[j].match(/Result of Round #(\d+)/i);
          if (nextRound) break;

          if (/^1\.\s+/.test(lines[j])) {
            const winner = cleanWinner(lines[j]);

            winners.push(winner);
            rounds.push({
              round: roundNumber,
              winner
            });

            break;
          }
        }
      }
    }

    res.json({
      verifyUrl,
      count: winners.length,
      winners,
      rounds,
      rawPreview: bodyText.slice(0, 2000)
    });
  } catch (err) {
    res.status(500).json({
      error: "Server error reading verify link.",
      details: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Cash calculator running on port ${PORT}`);
});
