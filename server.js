const express = require("express");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

function parseResultLine(line) {
  const cleaned = line.replace(/\s+/g, " ").trim();

  // RANDOM.ORG common format: 1. 5. Player Name
  let match = cleaned.match(/^(\d+)\.\s+(\d+)\.\s*(.*)$/);

  if (match) {
    const originalNumber = Number(match[2]);
    const rawName = (match[3] || "").trim();

    return {
      placement: Number(match[1]),
      spot: originalNumber,
      originalNumber,
      name: rawName || `#${originalNumber}`
    };
  }

  // Fallback: 1. Player Name
  match = cleaned.match(/^(\d+)\.\s+(.+)$/);

  if (match) {
    return {
      placement: Number(match[1]),
      spot: null,
      originalNumber: null,
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
    headers: {
      "User-Agent": "Mozilla/5.0 CashCalculatorBot"
    }
  });

  if (!response.ok) {
    throw new Error("Could not load RANDOM.ORG verify page.");
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  return $("body")
    .text()
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseRounds(bodyText) {
  const lines = bodyText.split("\n").map(x => x.trim()).filter(Boolean);
  const rounds = [];
  const initialSpots = {};

  for (let i = 0; i < lines.length; i++) {
    const roundMatch = lines[i].match(/Result of Round #(\d+)/i);

    if (!roundMatch) continue;

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
      rounds.push({
        round: roundNumber,
        entries
      });

      // First complete round contains the original 1-10 assignments.
      if (Object.keys(initialSpots).length === 0) {
        entries.forEach(entry => {
          if (entry.spot !== null && entry.spot >= 1 && entry.spot <= 10) {
            initialSpots[entry.spot] = entry.name;
          }
        });
      }
    }
  }

  return {
    rounds,
    initialSpots
  };
}

// Main DUST Jackpot endpoint
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
          name: winner.name,
          spot: winner.spot,
          originalNumber: winner.originalNumber
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
    res.status(500).json({
      error: err.message || "Server error reading verify link."
    });
  }
});

// TenTopper endpoint
app.get("/api/tentopper", async (req, res) => {
  try {
    const verifyUrl = req.query.url;
    const bodyText = await loadVerifyPage(verifyUrl);
    const parsed = parseRounds(bodyText);

    // TenTopper only needs first 10 rounds.
    const rounds = parsed.rounds.slice(0, 10);

    const topResults = [];
    const damageResults = [];

    rounds.forEach(round => {
      const sorted = round.entries.slice().sort((a, b) => a.placement - b.placement);

      // Top spot = placement #1 in each round.
      const top = sorted.find(x => x.placement === 1);

      // Damages = placement #10 in each round.
      const damage = sorted.find(x => x.placement === 10);

      if (top) {
        topResults.push({
          round: round.round,
          name: top.name,
          spot: top.spot,
          originalNumber: top.originalNumber
        });
      }

      if (damage) {
        damageResults.push({
          round: round.round,
          name: damage.name,
          spot: damage.spot,
          originalNumber: damage.originalNumber
        });
      }
    });

    res.json({
      verifyUrl,
      roundCount: rounds.length,
      topResults,
      damageResults,
      initialSpots: parsed.initialSpots
    });
  } catch (err) {
    res.status(500).json({
      error: err.message || "Server error reading verify link."
    });
  }
});

// Backward compatibility if an older TenTopper file calls /api/tt
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
    res.status(500).json({
      error: err.message || "Server error reading verify link."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Calculator running on port ${PORT}`);
});
