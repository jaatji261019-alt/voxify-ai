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
app.use(express.json({ limit: "50mb" }));

const upload = multer({ dest: "uploads/" });

// ================= HOME =================
app.get("/", (req, res) => {
  res.send("🚀 Voxify AI Cinematic Backend Running");
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
async function downloadImage(prompt, index) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    prompt + " cinematic lighting ultra realistic 4k"
  )}`;

  const imgPath = path.join(__dirname, `scene_${index}_${Date.now()}.jpg`);

  const res = await axios({
    url,
    method: "GET",
    responseType: "arraybuffer"
  });

  fs.writeFileSync(imgPath, res.data);
  return imgPath;
}

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
        responseType: "arraybuffer"
      });

      res.write(audio.data);
    }

    res.end();

  } catch (err) {
    console.error(err);
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

// ================= 🎬 CINEMATIC VIDEO =================
app.post("/cinematic-video", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).send("No text");

    const sentences = text.split(".").filter(s => s.trim()).slice(0, 4);

    const audioPath = path.join(__dirname, `audio_${Date.now()}.mp3`);
    const videoPath = path.join(__dirname, `video_${Date.now()}.mp4`);

    // 🔊 AUDIO GENERATE
    const ttsUrl = googleTTS.getAudioUrl(text, {
      lang: "en",
      slow: false,
    });

    const audioRes = await axios({
      url: ttsUrl,
      method: "GET",
      responseType: "arraybuffer"
    });

    fs.writeFileSync(audioPath, audioRes.data);

    // 🖼️ IMAGES
    let images = [];
    for (let i = 0; i < sentences.length; i++) {
      const img = await downloadImage(sentences[i], i);
      images.push(img);
    }

    // 🎬 CREATE VIDEO
    const command = ffmpeg();

    images.forEach(img => {
      command.input(img).inputOptions(["-loop 1", "-t 3"]);
    });

    command
      .input(audioPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .size("720x1280")
      .outputOptions([
        "-pix_fmt yuv420p",
        "-shortest"
      ])
      .on("end", () => {
        res.download(videoPath, "cinematic.mp4", () => {
          cleanup(audioPath, videoPath, images);
        });
      })
      .on("error", (err) => {
        console.error("FFmpeg error:", err);
        res.status(500).send("Video error");
      })
      .save(videoPath);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ================= CLEANUP =================
function cleanup(audio, video, images = []) {
  if (fs.existsSync(audio)) fs.unlinkSync(audio);
  if (fs.existsSync(video)) fs.unlinkSync(video);
  images.forEach(img => {
    if (fs.existsSync(img)) fs.unlinkSync(img);
  });
}

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🔥 Server running on port " + PORT);
});
