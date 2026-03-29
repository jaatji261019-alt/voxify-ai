const express = require("express");
const cors = require("cors");
const fs = require("fs");
const gTTS = require("gtts");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ===== Create audio =====
function createAudio(text, filename) {
  return new Promise((resolve, reject) => {
    const gtts = new gTTS(text, "en");
    gtts.save(filename, (err) => {
      if (err) reject(err);
      else resolve(filename);
    });
  });
}

// ===== TTS API =====
app.post("/tts", async (req, res) => {
  try {
    const { chunks } = req.body;

    if (!chunks || chunks.length === 0) {
      return res.status(400).send("No text provided");
    }

    // 👉 TEMP: only first chunk (stable version)
    const filePath = path.join(__dirname, "output.mp3");

    await createAudio(chunks[0], filePath);

    res.download(filePath, "voxify.mp3", () => {
      // cleanup after download
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ===== Health check =====
app.get("/", (req, res) => {
  res.send("Voxify AI Backend Running 🚀");
});

app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
