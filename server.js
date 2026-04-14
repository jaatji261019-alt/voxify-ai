const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const gTTS = require("gtts");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({ dest: "uploads/" });

// 🔥 Home route (IMPORTANT)
app.get("/", (req, res) => {
  res.send("Voxify AI Backend Running 🚀");
});

// 🔥 Split text (unlimited support)
function splitText(text, maxLength = 200) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}

// 🔊 TEXT → AUDIO
app.post("/tts", async (req, res) => {
  try {
    const { text, lang } = req.body;
    if (!text) return res.status(400).send("No text");

    const chunks = splitText(text);
    const files = [];

    for (let i = 0; i < chunks.length; i++) {
      const filePath = path.join(__dirname, `chunk_${i}.mp3`);
      const gtts = new gTTS(chunks[i], lang || "en");

      await new Promise(resolve => gtts.save(filePath, resolve));
      files.push(filePath);
    }

    const finalPath = path.join(__dirname, "final.mp3");
    const writeStream = fs.createWriteStream(finalPath);

    for (const file of files) {
      const data = fs.readFileSync(file);
      writeStream.write(data);
      fs.unlinkSync(file);
    }

    writeStream.end();

    writeStream.on("finish", () => {
      res.download(finalPath, "voxify.mp3", () => {
        fs.unlinkSync(finalPath);
      });
    });

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

    res.json({ text }); // 🔥 IMPORTANT

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "File error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running 🚀"));
