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

// 🎬 FFmpeg
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegPath);

// ================= APP =================
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const upload = multer({ dest: "uploads/" });

// ================= HOME =================
app.get("/", (req, res) => {
  res.send("🚀 Voxify AI Backend Running");
});

// ================= TEXT SPLIT =================
function splitText(text, maxLength = 200) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}

// ================= AI IMAGE =================
function getAIImage(prompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    prompt + " cinematic lighting ultra realistic 4k"
  )}`;
}

// ================= PROGRESS API =================
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

// ================= TEXT → AUDIO =================
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

      res.write(audio.data);
    }

    res.end();

  } catch (err) {
    console.error("TTS ERROR:", err.message);
    res.status(500).send("TTS Error");
  }
});

// ================= FILE UPLOAD =================
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

// ================= BASIC VIDEO =================
app.post("/create-video", async (req, res) => {
  try {
    const { audioUrl } = req.body;
    if (!audioUrl) return res.status(400).send("No audio");

    const audioPath = path.join(__dirname, `audio_${Date.now()}.mp3`);
    const videoPath = path.join(__dirname, `video_${Date.now()}.mp4`);

    // download audio
    const audioRes = await axios({
      url: audioUrl,
      method: "GET",
      responseType: "arraybuffer"
    });

    fs.writeFileSync(audioPath, audioRes.data);

    const bgUrl = `https://picsum.photos/720/1280?random=${Date.now()}`;

    ffmpeg()
      .input(bgUrl)
      .loop(10)
      .input(audioPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .size("720x1280")
      .outputOptions(["-pix_fmt yuv420p", "-shortest"])
      .save(videoPath)
      .on("end", () => {
        res.download(videoPath, "basic.mp4", () => {
          cleanup(audioPath, videoPath);
        });
      })
      .on("error", err => {
        console.error(err);
        res.status(500).send("Video error");
      });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ================= 🎬 CINEMATIC VIDEO =================
app.post("/cinematic-video", async (req, res) => {
  try {
    const { text, audioUrl } = req.body;
    if (!text || !audioUrl) {
      return res.status(400).send("Missing data");
    }

    const sentences = text.split(".").filter(s => s.trim());

    const audioPath = path.join(__dirname, `audio_${Date.now()}.mp3`);
    const videoPath = path.join(__dirname, `cinematic_${Date.now()}.mp4`);

    // download audio
    const audioRes = await axios({
      url: audioUrl,
      method: "GET",
      responseType: "arraybuffer"
    });

    fs.writeFileSync(audioPath, audioRes.data);

    const command = ffmpeg();

    // 🎬 MULTIPLE SCENES
    for (let sentence of sentences) {
      const img = getAIImage(sentence);
      command.input(img).loop(3); // 3 sec per scene
    }

    command
      .input(audioPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .size("720x1280")
      .outputOptions(["-pix_fmt yuv420p", "-shortest"])
      .save(videoPath)
      .on("end", () => {
        res.download(videoPath, "cinematic.mp4", () => {
          cleanup(audioPath, videoPath);
        });
      })
      .on("error", err => {
        console.error("FFmpeg error:", err);
        res.status(500).send("Cinematic error");
      });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ================= CLEANUP =================
function cleanup(audio, video) {
  if (fs.existsSync(audio)) fs.unlinkSync(audio);
  if (fs.existsSync(video)) fs.unlinkSync(video);
}

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🔥 Server running on port " + PORT);
});
