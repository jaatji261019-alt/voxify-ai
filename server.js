const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs");

const upload = multer({ dest: "uploads/" });
const multer = require("multer");
const pdfParse = require("pdf-parse");

const upload = multer({ dest: "uploads/" });

const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const gTTS = require("gtts");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

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

app.post("/tts", async (req, res) => {
  try {
    const { text, lang } = req.body;

    if (!text) return res.status(400).send("No text");

    const chunks = splitText(text);
    const files = [];

    // 🔥 Generate each chunk
    for (let i = 0; i < chunks.length; i++) {
      const filePath = path.join(__dirname, `chunk_${i}.mp3`);
      const gtts = new gTTS(chunks[i], lang || "en");

      await new Promise(resolve => {
        gtts.save(filePath, resolve);
      });

      files.push(filePath);
    }

    // 🔥 Merge all chunks
    const finalPath = path.join(__dirname, "final.mp3");
    const writeStream = fs.createWriteStream(finalPath);

    for (const file of files) {
      const data = fs.readFileSync(file);
      writeStream.write(data);
      fs.unlinkSync(file); // delete chunk
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

app.listen(3000, () => {
  console.log("Chunk TTS server running");
});

app.post("/upload-pdf", upload.single("pdf"), async (req, res) => {
  try {
    const filePath = req.file.path;

    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);

    fs.unlinkSync(filePath); // delete file

    res.json({ text: data.text });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PDF read error" });
  }
});
