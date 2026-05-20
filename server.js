const express = require("express");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

function parseResultLine(line) {
  const cleaned = line.replace(/\s+/g, " ").trim();

  // Common RANDOM.ORG format:
  // 1. 5. Jason Park
  // placement = 1, spot = 5, name = Jason Park
  let match = cleaned.match(/^(\d+)\.\s+(\d+)\.\s+(.+)$/);
  if (match) {
    return {
      placement: Number(match[1]),
      spot: Number(match[2]),
      name: match[3].trim()
    };
  }

  // Fallback:
  // 1. Jason Park
  match = cleaned.match(/^(\d+)\.\s+(.+)$/);
  if (match) {
    return {
      placement: Number(match[1]),
      spot: null,
      name: match[2].trim()
    };
  }

  return null;
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
    let initialSpots = {};

    for (let i = 0; i < lines.length; i++) {
      const roundMatch = lines[i].match(/Result of Round #(\d+)/i);

      if (roundMatch) {
        const roundNumber = Number(roundMatch[1]);
        const roundEntries = [];

        for (let j = i + 1; j < lines.length; j++) {
          const nextRound = lines[j].match(/Result of Round #(\d+)/i);
          if (nextRound) break;

          const parsed = parseResultLine(lines[j]);

          if (parsed && parsed.placement >= 1 && parsed.placement <= 10) {
            roundEntries.push(parsed);
          }
        }

        if (roundEntries.length > 0) {
          const winner = roundEntries.find(x => x.placement === 1);

          if (winner) {
            winners.push(winner.name);

            rounds.push({
              round: roundNumber,
              winner: winner.name,
              spot: winner.spot
            });
          }

          if (Object.keys(initialSpots).length === 0) {
            roundEntries.forEach(entry => {
              if (entry.spot !== null && entry.spot >= 1 && entry.spot <= 10) {
                initialSpots[entry.spot] = entry.name;
              } else if (entry.placement >= 1 && entry.placement <= 10) {
                initialSpots[entry.placement] = entry.name;
              }
            });
          }
        }
      }
    }

    res.json({
      verifyUrl,
      count: winners.length,
      winners,
      rounds,
      initialSpots,
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
