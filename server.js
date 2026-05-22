const express = require("express");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

function parseResultLine(line) {
  const cleaned = line.replace(/\s+/g, " ").trim();

  // RANDOM.ORG format: 1. 5. Player Name
  let match = cleaned.match(/^(\d+)\.\s+(\d+)\.\s*(.*)$/);
  if (match) {
    const spot = Number(match[2]);
    const rawName = (match[3] || "").trim();

    return {
      placement: Number(match[1]),
      originalNumber: spot,
      name: rawName || `#${spot}`
    };
  }

  // Fallback: 1. Player Name
  match = cleaned.match(/^(\d+)\.\s+(.+)$/);
  if (match) {
    return {
      placement: Number(match[1]),
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
      }
    }
  }

  return rounds;
}

app.get("/api/tentopper", async (req, res) => {
  try {
    const verifyUrl = req.query.url;
    const bodyText = await loadVerifyPage(verifyUrl);
    const rounds = parseRounds(bodyText).slice(0, 10);

    const topResults = [];
    const damageResults = [];

    rounds.forEach(round => {
      const sorted = round.entries.slice().sort((a, b) => a.placement - b.placement);

      // Top spot means placement #1 in that round.
      const top = sorted.find(x => x.placement === 1);

      // Damages are the person who ends up in position/placement #10 each round.
      const damage = sorted.find(x => x.placement === 10);

      if (top) {
        topResults.push({
          round: round.round,
          name: top.name
        });
      }

      if (damage) {
        damageResults.push({
          round: round.round,
          name: damage.name
        });
      }
    });

    res.json({
      roundCount: rounds.length,
      topResults,
      damageResults
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Server error reading verify link." });
  }
});

app.listen(PORT, () => {
  console.log(`TenTopper running on port ${PORT}`);
});
