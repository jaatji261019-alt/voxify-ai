// ================= IMPORTS =================
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const googleTTS = require("google-tts-api");
const axios = require("axios");
const fs = require("fs");

// 🧠 OCR
const Tesseract = require("tesseract.js");
const { fromPath } = require("pdf2pic");

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
  res.send("🚀 Voxify AI Backend Running (FULL POWER MODE)");
});

// ================= TEXT SPLIT =================
function splitText(text, maxLength = 200) {
  let chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}

// ================= 🌍 AUTO LANGUAGE DETECT =================
function detectLang(text) {
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  return "en";
}

// ================= 🧠 OCR FUNCTION =================
async function extractTextFromScannedPDF(pdfPath) {
  const convert = fromPath(pdfPath, {
    density: 120,
    saveFilename: "page",
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
        "eng+hin+ara+spa+fra+deu",
        {
          logger: m => console.log("OCR:", m.status),
        }
      );

      finalText += result.data.text + "\n";

      fs.unlinkSync(page.path);
    } catch {
      break;
    }
  }

  return finalText;
}

// ================= 🔊 TTS BUFFER =================
async function generateTTSBuffer(text, lang) {
  const chunks = splitText(text);
  let buffers = [];

  for (const chunk of chunks) {
    const url = googleTTS.getAudioUrl(chunk, {
      lang,
      slow: false,
    });

    const res = await axios.get(url, {
      responseType: "arraybuffer",
    });

    buffers.push(res.data);
  }

  return Buffer.concat(buffers);
}

// ================= 🎧 TTS API =================
app.post("/tts", async (req, res) => {
  try {
    const { text, lang } = req.body;

    if (!text) return res.status(400).send("No text");

    const finalLang = lang || detectLang(text);

    const audio = await generateTTSBuffer(text, finalLang);

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audio);

  } catch (err) {
    console.error("TTS ERROR:", err);
    res.status(500).send("TTS failed");
  }
});

// ================= 📄 FILE → TEXT =================
app.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const type = req.file.mimetype;

    let text = "";

    // ===== PDF =====
    if (type === "application/pdf") {
      try {
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse(buffer);

        text = data.text;

        if (!text || text.trim().length < 30) {
          console.log("⚠️ OCR fallback...");
          text = await extractTextFromScannedPDF(filePath);
        }

      } catch {
        text = await extractTextFromScannedPDF(filePath);
      }
    }

    // ===== WORD =====
    else if (type.includes("word")) {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    }

    // ===== TXT =====
    else if (type === "text/plain") {
      text = fs.readFileSync(filePath, "utf-8");
    }

    else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "Unsupported file" });
    }

    fs.unlinkSync(filePath);

    if (!text || text.trim().length < 10) {
      return res.status(400).json({ error: "Text extraction failed" });
    }

    res.json({
      text: text.replace(/\s+/g, " ").trim()
    });

  } catch (err) {
    console.error(err);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: "File processing failed" });
  }
});

// ================= 🔥 PDF → AUDIO DIRECT =================
app.post("/pdf-to-audio", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No file");

    const filePath = req.file.path;

    let text = "";

    try {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);

      text = data.text;

      if (!text || text.length < 30) {
        text = await extractTextFromScannedPDF(filePath);
      }

    } catch {
      text = await extractTextFromScannedPDF(filePath);
    }

    fs.unlinkSync(filePath);

    if (!text || text.length < 10) {
      return res.status(400).send("No text extracted");
    }

    const lang = detectLang(text);

    const audio = await generateTTSBuffer(text, lang);

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audio);

  } catch (err) {
    console.error(err);
    res.status(500).send("PDF → Audio failed");
  }
});

// ================= 🖼 IMAGE =================
app.post("/generate-images", async (req, res) => {
  try {
    const { text } = req.body;

    const lines = text.split(".").filter(t => t.trim()).slice(0, 4);

    const images = lines.map(line =>
      `https://image.pollinations.ai/prompt/${encodeURIComponent(
        line + " cinematic lighting ultra realistic 4k"
      )}`
    );

    res.json({ images });

  } catch (err) {
    res.status(500).json({ error: "Image error" });
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🔥 Server running on port " + PORT);
});
