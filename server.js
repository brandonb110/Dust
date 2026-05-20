const express = require("express");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

function parseResultLine(line) {
  const cleaned = line.replace(/\s+/g, " ").trim();

  // RANDOM.ORG format:
  // 1. 5. Player Name
  // Also supports blank names like:
  // 10. 1.
  let match = cleaned.match(/^(\d+)\.\s+(\d+)\.\s*(.*)$/);
  if (match) {
    const spot = Number(match[2]);
    const rawName = (match[3] || "").trim();

    return {
      placement: Number(match[1]),
      spot,
      name: rawName || `#${spot}`
    };
  }

  // Fallback:
  // 1. Player Name
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

async function loadVerifyPage(verifyUrl) {
  if (!verifyUrl || !verifyUrl.startsWith("https://giveaways.random.org/verify/")) {
    throw new Error("Please enter a valid RANDOM.ORG giveaway verify link.");
  }

  const response = await fetch(verifyUrl, {
    headers: { "User-Agent": "Mozilla/5.0 CashCalculatorBot" }
  });

  if (!response.ok) {
    throw new Error("Could not load RANDOM.ORG verify page.");
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  return $("body").text()
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseRounds(bodyText) {
  const lines = bodyText.split("\n").map(x => x.trim()).filter(Boolean);
  const rounds = [];
  let initialSpots = {};

  for (let i = 0; i < lines.length; i++) {
    const roundMatch = lines[i].match(/Result of Round #(\d+)/i);

    if (roundMatch) {
      const roundNumber = Number(roundMatch[1]);
      const entries = [];

      for (let j = i + 1; j < lines.length; j++) {
        const nextRound = lines[j].match(/Result of Round #(\d+)/i);
        if (nextRound) break;

        const parsed = parseResultLine(lines[j]);

        if (parsed && parsed.placement >= 1 && parsed.placement <= 10) {
          entries.push(parsed);
        }
      }

      if (entries.length > 0) {
        rounds.push({ round: roundNumber, entries });

        // First round contains all original assigned spots.
        if (Object.keys(initialSpots).length === 0) {
          entries.forEach(entry => {
            if (entry.spot !== null && entry.spot >= 1 && entry.spot <= 10) {
              initialSpots[entry.spot] = entry.name;
            }
          });
        }
      }
    }
  }

  return { rounds, initialSpots };
}

app.get("/api/verify", async (req, res) => {
  try {
    const verifyUrl = req.query.url;
    const bodyText = await loadVerifyPage(verifyUrl);
    const parsed = parseRounds(bodyText);

    const winners = [];
    const winnerRounds = [];

    parsed.rounds.forEach(round => {
      const winner = round.entries.find(x => x.placement === 1);

      if (winner) {
        winners.push(winner.name);

        winnerRounds.push({
          round: round.round,
          winner: winner.name,
          spot: winner.spot
        });
      }
    });

    res.json({
      verifyUrl,
      count: winners.length,
      winners,
      rounds: winnerRounds,
      initialSpots: parsed.initialSpots,
      rawPreview: bodyText.slice(0, 2000)
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Server error reading verify link." });
  }
});

app.get("/api/tt", async (req, res) => {
  try {
    const verifyUrl = req.query.url;
    const bottomCount = Math.max(1, Math.min(5, Number(req.query.bottom || 1)));

    const bodyText = await loadVerifyPage(verifyUrl);
    const parsed = parseRounds(bodyText);

    const topList = [];
    const bottomList = [];
    const bottomTally = {};

    parsed.rounds.forEach(round => {
      const sorted = round.entries.slice().sort((a, b) => a.placement - b.placement);
      const top = sorted.find(x => x.placement === 1);

      if (top) {
        topList.push({
          round: round.round,
          spot: top.spot,
          name: top.name
        });
      }

      const bottomEntries = sorted.slice(-bottomCount);

      bottomEntries.forEach(entry => {
        bottomList.push({
          round: round.round,
          spot: entry.spot,
          placement: entry.placement,
          name: entry.name
        });

        if (!bottomTally[entry.name]) {
          bottomTally[entry.name] = 0;
        }

        bottomTally[entry.name]++;
      });
    });

    res.json({
      verifyUrl,
      bottomCount,
      roundCount: parsed.rounds.length,
      topList,
      bottomList,
      bottomTally,
      initialSpots: parsed.initialSpots
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Server error reading verify link." });
  }
});

app.listen(PORT, () => {
  console.log(`Calculator running on port ${PORT}`);
});
