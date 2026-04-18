const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const googleTTS = require("google-tts-api");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// 🎬 FFmpeg
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegPath);

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

// 📊 PROGRESS API (SSE)
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

// 🔊 TEXT → AUDIO (STREAM FIXED)
app.post("/tts", async (req, res) => {
  try {
    const { text, lang } = req.body;
    if (!text) return res.status(400).send("No text");

    const chunks = splitText(text);

    res.set({ "Content-Type": "audio/mpeg" });

    for (let chunk of chunks) {
      const url = googleTTS.getAudioUrl(chunk, {
        lang: lang || "en",
        slow: false,
        host: "https://translate.google.com"
      });

      const response = await axios({
        url,
        method: "GET",
        responseType: "arraybuffer"
      });

      res.write(response.data);
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

// 🎬 MP4 VIDEO GENERATOR (AI BACKGROUND)
app.post("/create-video", async (req, res) => {
  try {
    const { audioUrl } = req.body;
    if (!audioUrl) return res.status(400).send("No audio");

    const audioPath = path.join(__dirname, `audio_${Date.now()}.mp3`);
    const videoPath = path.join(__dirname, `video_${Date.now()}.mp4`);

    // 🔽 download audio
    const audioRes = await axios({
      url: audioUrl,
      method: "GET",
      responseType: "arraybuffer"
    });

    fs.writeFileSync(audioPath, audioRes.data);

    // 🎨 AI Background (random image)
    const bgUrl = "https://picsum.photos/720/1280?random=" + Math.random();

    ffmpeg()
      .input(bgUrl)
      .loop(10) // duration
      .input(audioPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .size("720x1280")
      .outputOptions([
        "-pix_fmt yuv420p",
        "-shortest"
      ])
      .save(videoPath)
      .on("end", () => {
        res.download(videoPath, "voxify.mp4", () => {
          fs.unlinkSync(audioPath);
          fs.unlinkSync(videoPath);
        });
      })
      .on("error", (err) => {
        console.error("FFmpeg Error:", err);
        res.status(500).send("Video error");
      });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// 🚀 START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
