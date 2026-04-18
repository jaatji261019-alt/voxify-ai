const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const googleTTS = require("google-tts-api");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// 🎬 FFmpeg setup
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

// 🔥 TEXT SPLIT
function splitText(text, maxLength = 200) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}

//
// 📊 PROGRESS API (SSE)
//
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
    await new Promise(r => setTimeout(r, 120));
  }

  res.write(`data: done\n\n`);
  res.end();
});

//
// 🔊 TEXT → AUDIO (BEST STREAM VERSION)
//
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
        host: "https://translate.google.com"
      });

      const audio = await axios.get(url, {
        responseType: "arraybuffer"
      });

      res.write(audio.data); // 🔥 direct stream
    }

    res.end();

  } catch (err) {
    console.error("TTS ERROR:", err.message);
    res.status(500).send("TTS Error");
  }
});

//
// 📄 FILE UPLOAD
//
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
      return res.status(400).json({ error: "Unsupported file" });
    }

    fs.unlinkSync(filePath);
    res.json({ text });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "File error" });
  }
});

//
// 🎬 VIDEO GENERATOR (FIXED + SAFE)
//
app.post("/create-video", async (req, res) => {
  try {
    const { audioUrl } = req.body;
    if (!audioUrl) return res.status(400).send("No audio");

    const audioPath = path.join(__dirname, `audio_${Date.now()}.mp3`);
    const videoPath = path.join(__dirname, `video_${Date.now()}.mp4`);

    // 🔽 Download audio
    const audioRes = await axios({
      url: audioUrl,
      method: "GET",
      responseType: "arraybuffer"
    });

    fs.writeFileSync(audioPath, audioRes.data);

    // 🎨 Random background
    const bgUrl = `https://picsum.photos/720/1280?random=${Date.now()}`;

    ffmpeg()
      .input(bgUrl)
      .loop(10)
      .input(audioPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .size("720x1280")
      .outputOptions([
        "-pix_fmt yuv420p",
        "-shortest"
      ])
      .on("end", () => {
        res.download(videoPath, "voxify.mp4", () => {
          if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
          if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        });
      })
      .on("error", (err) => {
        console.error("FFmpeg ERROR:", err);
        res.status(500).send("Video error");
      })
      .save(videoPath);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

//
// 🚀 START SERVER
//
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
