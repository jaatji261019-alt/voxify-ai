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

const Tesseract = require("tesseract.js");
const { fromPath } = require("pdf2pic");

// ================= CONFIG =================
const PYTHON_API = "https://voxify-python-api.onrender.com";
const VIDEO_API = "https://voxify-cinematic-api.onrender.com";

// ================= APP =================
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/uploads", express.static("uploads"));

// ================= FOLDERS =================
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("converted")) fs.mkdirSync("converted");

// ================= MULTER =================
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// ================= HOME =================
app.get("/", (req, res) => {
  res.send("🚀 Voxify AI Backend Running (ULTRA PRO MAX)");
});

// ================= LANGUAGE =================
function detectLang(text) {
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  return "en";
}

// ================= STYLE =================
function getStyleSettings(style) {
  switch (style) {
    case "deep": return { pitch: "-20Hz", rate: "-10%" };
    case "soft": return { pitch: "+10Hz", rate: "-5%" };
    case "sad": return { pitch: "-10Hz", rate: "-20%" };
    case "angry": return { pitch: "+15Hz", rate: "+15%" };
    case "story": return { pitch: "+5Hz", rate: "-10%" };
    default: return { pitch: "0Hz", rate: "0%" };
  }
}

// ================= OCR =================
async function extractTextFromScannedPDF(pdfPath) {
  const convert = fromPath(pdfPath, {
    density: 120,
    savePath: "./converted",
    format: "png",
    width: 1000,
    height: 1400,
  });

  let finalText = "";

  for (let i = 1; i <= 5; i++) {
    try {
      const page = await convert(i);

      const result = await Tesseract.recognize(
        page.path,
        "eng+hin+ara"
      );

      finalText += result.data.text + "\n";
      fs.unlinkSync(page.path);

    } catch {
      break;
    }
  }

  return finalText;
}

// ================= FALLBACK TTS =================
async function generateFallbackTTS(text, lang) {
  const chunks = text.match(/.{1,200}/g) || [];
  let buffers = [];

  for (const chunk of chunks) {
    const url = googleTTS.getAudioUrl(chunk, { lang });
    const res = await axios.get(url, { responseType: "arraybuffer" });
    buffers.push(res.data);
  }

  return Buffer.concat(buffers);
}

// ================= 🔊 TTS =================
app.post("/tts", async (req, res) => {
  try {
    const { text, voice, style } = req.body;

    if (!text) return res.status(400).send("No text");

    const { pitch, rate } = getStyleSettings(style);

    try {
      const response = await axios.post(
        `${PYTHON_API}/tts`,
        { text, voice, pitch, rate },
        { responseType: "stream", timeout: 60000 }
      );

      res.setHeader("Content-Type", "audio/mpeg");
      response.data.pipe(res);

    } catch (err) {
      console.log("⚠️ Python TTS failed");

      const lang = detectLang(text);
      const audio = await generateFallbackTTS(text, lang);

      res.setHeader("Content-Type", "audio/mpeg");
      res.send(audio);
    }

  } catch (err) {
    console.error(err);
    res.status(500).send("TTS failed");
  }
});

// ================= 🎤 AUDIO UPLOAD =================
app.post("/upload-audio", upload.single("file"), (req, res) => {
  try {
    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

    // 🔥 auto delete after 10 min
    setTimeout(() => {
      fs.unlink(req.file.path, () => {});
    }, 10 * 60 * 1000);

    res.json({ url: fileUrl });

  } catch {
    res.status(500).json({ error: "Upload failed" });
  }
});

// ================= 🎬 VIDEO =================
app.post("/generate-video", async (req, res) => {
  try {
    const { text, audioUrl } = req.body;

    if (!text || !audioUrl) {
      return res.status(400).json({ error: "Missing data" });
    }

    const response = await axios.post(
      `${VIDEO_API}/cinematic`,
      { text, audioUrl },
      {
        responseType: "stream",
        timeout: 120000 // 2 min max
      }
    );

    res.setHeader("Content-Type", "video/mp4");
    response.data.pipe(res);

  } catch (err) {
    console.error("Video Error:", err.message);
    res.status(500).send("Video failed");
  }
});

// ================= VOICES =================
app.get("/voices", async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_API}/voices`);
    res.json(response.data);
  } catch {
    res.json([{ name: "en-US-AriaNeural", lang: "en" }]);
  }
});

// ================= FILE → TEXT =================
app.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });

    const filePath = req.file.path;
    const type = req.file.mimetype;
    let text = "";

    if (type === "application/pdf") {
      try {
        const data = await pdfParse(fs.readFileSync(filePath));
        text = data.text;

        if (!text || text.length < 30) {
          text = await extractTextFromScannedPDF(filePath);
        }

      } catch {
        text = await extractTextFromScannedPDF(filePath);
      }
    }

    else if (type.includes("word")) {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    }

    else if (type === "text/plain") {
      text = fs.readFileSync(filePath, "utf-8");
    }

    fs.unlinkSync(filePath);

    if (!text || text.length < 10) {
      return res.status(400).json({ error: "Text extraction failed" });
    }

    res.json({ text: text.trim() });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "File processing failed" });
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🔥 Voxify Server running on port " + PORT);
});
