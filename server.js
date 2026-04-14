const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const googleTTS = require("google-tts-api");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({ dest: "uploads/" });

// 🏠 Home
app.get("/", (req, res) => {
  res.send("Voxify AI Backend Running 🚀");
});

// 🔥 TEXT → AUDIO (FIXED)
app.post("/tts", async (req, res) => {
  try {
    const { text, lang } = req.body;

    if (!text) return res.status(400).send("No text");

    // 🔥 Google TTS URL
    const url = googleTTS.getAudioUrl(text, {
      lang: lang || "en",
      slow: false,
      host: "https://translate.google.com"
    });

    // 🔥 STREAM AUDIO (NO CORS ISSUE)
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream"
    });

    res.set({
      "Content-Type": "audio/mpeg"
    });

    response.data.pipe(res);

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
    }

    fs.unlinkSync(filePath);

    res.json({ text });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "File error" });
  }
});

// 🚀 START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running 🚀"));
