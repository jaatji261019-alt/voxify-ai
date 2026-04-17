const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const googleTTS = require("google-tts-api");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const upload = multer({ dest: "uploads/" });

// 🏠 HOME
app.get("/", (req, res) => {
  res.send("Voxify AI Backend Running 🚀");
});

// 🔥 SPLIT TEXT
function splitText(text, maxLength = 200) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}

// 📊 PROGRESS API
app.get("/tts-progress", async (req, res) => {
  const text = req.query.text;
  if (!text) return res.end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const chunks = splitText(text);

  for (let i = 0; i < chunks.length; i++) {
    const percent = Math.round(((i + 1) / chunks.length) * 100);
    res.write(`data: ${percent}\n\n`);
    await new Promise(r => setTimeout(r, 150));
  }

  res.write(`data: done\n\n`);
  res.end();
});

// 🔊 TEXT → AUDIO (🔥 FIXED STREAM VERSION)
app.post("/tts", async (req, res) => {
  try {
    const { text, lang } = req.body;

    if (!text) return res.status(400).send("No text");

    const chunks = splitText(text);

    res.set({
      "Content-Type": "audio/mpeg"
    });

    // 🔥 STREAM ALL CHUNKS ONE BY ONE
    for (let i = 0; i < chunks.length; i++) {
      const url = googleTTS.getAudioUrl(chunks[i], {
        lang: lang || "en",
        slow: false,
        host: "https://translate.google.com"
      });

      const response = await axios({
        url,
        method: "GET",
        responseType: "arraybuffer"
      });

      res.write(response.data); // 🔥 directly stream
    }

    res.end();

  } catch (err) {
    console.error("TTS ERROR:", err.message);
    res.status(500).send("TTS Error");
  }
});

// 📄 FILE UPLOAD
app.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    const fs = require("fs");
    const filePath = req.file.path;
    const type = req.file.mimetype;

    let text = "";

    if (type === "application/pdf") {
      const data = await pdfParse(fs.readFileSync(filePath));
      text = data.text;
    } else if (type.includes("word")) {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    } else if (type === "text/plain") {
      text = fs.readFileSync(filePath, "utf-8");
    } else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "Unsupported file type" });
    }

    fs.unlinkSync(filePath);
    res.json({ text });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "File processing error" });
  }
});

// 🚀 START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
