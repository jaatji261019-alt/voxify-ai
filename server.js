// ================= IMPORTS =================
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const googleTTS = require("google-tts-api");
const axios = require("axios");
const fs = require("fs");

const Tesseract = require("tesseract.js");
const { fromPath } = require("pdf2pic");

// ================= CONFIG =================
const PYTHON_API = "https://voxify-python-api.onrender.com";

// ================= APP =================
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ================= FOLDERS =================
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("converted")) fs.mkdirSync("converted");

const upload = multer({ dest: "uploads/" });

// ================= HOME =================
app.get("/", (req, res) => {
  res.send("🚀 Voxify AI Backend Running (PRO MODE)");
});

// ================= TEXT SPLIT =================
function splitText(text, maxLength = 200) {
  let chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}

// ================= LANGUAGE DETECT =================
function detectLang(text) {
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  return "en";
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
        "eng+hin+ara",
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
  const chunks = splitText(text);
  let buffers = [];

  for (const chunk of chunks) {
    const url = googleTTS.getAudioUrl(chunk, { lang });
    const res = await axios.get(url, { responseType: "arraybuffer" });
    buffers.push(res.data);
  }

  return Buffer.concat(buffers);
}

// ================= 🔊 MAIN TTS =================
app.post("/tts", async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text) return res.status(400).send("No text");

    // 🔥 Try Python API first
    try {
      const response = await axios.post(
        `${PYTHON_API}/tts`,
        { text, voice: voice || "en-US-AriaNeural" },
        { responseType: "stream" }
      );

      res.setHeader("Content-Type", "audio/mpeg");
      response.data.pipe(res);

    } catch (err) {
      console.log("⚠️ Python TTS failed, using fallback...");

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

// ================= PDF → AUDIO =================
app.post("/pdf-to-audio", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No file");

    const filePath = req.file.path;
    let text = "";

    try {
      const data = await pdfParse(fs.readFileSync(filePath));
      text = data.text;

      if (!text || text.length < 30) {
        text = await extractTextFromScannedPDF(filePath);
      }

    } catch {
      text = await extractTextFromScannedPDF(filePath);
    }

    fs.unlinkSync(filePath);

    const response = await axios.post(
      `${PYTHON_API}/tts`,
      { text },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", "audio/mpeg");
    response.data.pipe(res);

  } catch (err) {
    console.error(err);
    res.status(500).send("PDF → Audio failed");
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🔥 Voxify Server running on port " + PORT);
});
