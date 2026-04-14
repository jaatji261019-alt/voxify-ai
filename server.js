const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const googleTTS = require("google-tts-api");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({ dest: "uploads/" });

// 🏠 Home route
app.get("/", (req, res) => {
  res.send("Voxify AI Backend Running 🚀");
});

// 🔥 Split text (Google TTS limit handle)
function splitText(text, maxLength = 200) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}

// 🔊 TEXT → AUDIO (Google TTS)
app.post("/tts", async (req, res) => {
  try {
    const { text, lang } = req.body;

    if (!text) return res.status(400).send("No text");

    const chunks = splitText(text);
    const urls = [];

    // 🔥 Create URL for each chunk
    chunks.forEach(chunk => {
      const url = googleTTS.getAudioUrl(chunk, {
        lang: lang || "en",
        slow: false,
        host: "https://translate.google.com"
      });
      urls.push(url);
    });

    // 🔥 Send all URLs
    res.json({ urls });

  } catch (err) {
    console.error(err);
    res.status(500).send("TTS Error");
  }
});

// 📄 FILE UPLOAD (PDF / DOCX / TXT)
app.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
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
    }

    fs.unlinkSync(filePath);

    res.json({ text });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "File error" });
  }
});

// 🚀 START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running 🚀"));
