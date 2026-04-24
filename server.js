// ================= IMPORTS =================
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const googleTTS = require("google-tts-api");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegPath);

// ================= APP =================
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ✅ ensure uploads folder exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

const upload = multer({ dest: "uploads/" });

// ================= HOME =================
app.get("/", (req, res) => {
  res.send("🚀 Voxify AI Backend Running");
});

// ================= TEXT SPLIT =================
function splitText(text, maxLength = 200) {
  let chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}

// ================= SSE PROGRESS =================
app.get("/tts-progress", async (req, res) => {
  const text = req.query.text;
  if (!text) return res.end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  res.flushHeaders();

  const chunks = splitText(text);

  for (let i = 0; i < chunks.length; i++) {
    const percent = Math.round(((i + 1) / chunks.length) * 100);
    res.write(`data: ${percent}\n\n`);
    await new Promise((r) => setTimeout(r, 150));
  }

  res.write(`data: done\n\n`);
  res.end();
});

// ================= TTS =================
app.post("/tts", async (req, res) => {
  try {
    const { text, lang } = req.body;
    if (!text) return res.status(400).send("No text");

    const chunks = splitText(text);
    res.setHeader("Content-Type", "audio/mpeg");

    for (const chunk of chunks) {
      const url = googleTTS.getAudioUrl(chunk, {
        lang: lang || "en",
        slow: false,
      });

      const audio = await axios.get(url, {
        responseType: "arraybuffer",
      });

      res.write(audio.data);
    }

    res.end();
  } catch (err) {
    console.error("TTS ERROR:", err);
    res.status(500).send("TTS Error");
  }
});

// ================= FILE UPLOAD (🔥 FIXED) =================
app.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    // ✅ FIX 1: check file exists
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const type = req.file.mimetype;

    console.log("📂 File type:", type);

    let text = "";

    // ================= PDF =================
    if (type === "application/pdf") {
      try {
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse(buffer);

        text = data.text;

        // ❌ empty PDF fix
        if (!text || text.trim().length < 20) {
          throw new Error("PDF empty or scanned");
        }

      } catch (err) {
        fs.unlinkSync(filePath);
        return res.status(400).json({
          error: "❌ PDF not supported (maybe scanned)"
        });
      }
    }

    // ================= WORD =================
    else if (type.includes("word")) {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    }

    // ================= TXT =================
    else if (type === "text/plain") {
      text = fs.readFileSync(filePath, "utf-8");
    }

    // ================= INVALID =================
    else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "Unsupported file" });
    }

    // cleanup
    fs.unlinkSync(filePath);

    console.log("✅ Extracted length:", text.length);

    res.json({
      text: text.replace(/\s+/g, " ").trim()
    });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: "File processing failed" });
  }
});

// ================= IMAGE GENERATION =================
app.post("/generate-images", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text" });

    const lines = text.split(".").filter(t => t.trim()).slice(0, 4);

    const images = lines.map(line =>
      `https://image.pollinations.ai/prompt/${encodeURIComponent(
        line + " cinematic lighting ultra realistic 4k"
      )}`
    );

    res.json({ images });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Image generation failed" });
  }
});

// ================= ⚠️ VIDEO (OPTIONAL / HEAVY) =================
// ❗ Render free pe fail hoga mostly
app.post("/cinematic-video", async (req, res) => {
  return res.status(400).json({
    error: "⚠️ Video generation disabled on free server"
  });
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🔥 Server running on port " + PORT);
});
