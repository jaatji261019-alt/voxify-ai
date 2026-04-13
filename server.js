const express = require("express");
const cors = require("cors");
const gTTS = require("gtts");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 📁 Upload config
const upload = multer({ dest: "uploads/" });

// 🔥 ROOT ROUTE
app.get("/", (req, res) => {
  res.send("Voxify AI Backend Running 🚀");
});

// 🔥 Split text into chunks
function splitText(text, maxLength = 200) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let chunks = [];
  let current = "";

  sentences.forEach(sentence => {
    if ((current + sentence).length > maxLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  });

  if (current) chunks.push(current);
  return chunks;
}

// 🔊 TEXT → SPEECH
app.post("/tts", async (req, res) => {
  try {
    const { text, lang } = req.body;
    if (!text) return res.status(400).send("No text");

    const chunks = splitText(text);
    const files = [];

    for (let i = 0; i < chunks.length; i++) {
      const filePath = path.join(__dirname, `chunk_${i}.mp3`);
      const tts = new gTTS(chunks[i], lang || "en");

      await new Promise(resolve => {
        tts.save(filePath, resolve);
      });

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
    res.status(500).send("Error processing text");
  }
});

// 📄 FILE UPLOAD (PDF / DOCX / TXT)
app.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileType = req.file.mimetype;

    let text = "";

    // PDF
    if (fileType === "application/pdf") {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      text = data.text;
    }

    // DOCX
    else if (
      fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    }

    // TXT
    else if (fileType === "text/plain") {
      text = fs.readFileSync(filePath, "utf-8");
    }

    else {
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

// 🚀 START SERVER
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
