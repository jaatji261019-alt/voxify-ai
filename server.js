const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const googleTTS = require("google-tts-api");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const upload = multer({ dest: "uploads/" });

// 🏠 HOME
app.get("/", (req, res) => {
  res.send("Voxify AI Backend Running 🚀");
});

// 🔥 SPLIT TEXT (UNLIMITED SUPPORT)
function splitText(text, maxLength = 200) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}

// 🔊 TEXT → AUDIO (UNLIMITED + MERGE)
app.post("/tts", async (req, res) => {
  try {
    const { text, lang } = req.body;

    if (!text) return res.status(400).send("No text");

    const chunks = splitText(text);
    const files = [];

    // 🔥 STEP 1: GENERATE AUDIO CHUNKS
    for (let i = 0; i < chunks.length; i++) {
      const url = googleTTS.getAudioUrl(chunks[i], {
        lang: lang || "en",
        slow: false,
        host: "https://translate.google.com"
      });

      const filePath = path.join(__dirname, `chunk_${Date.now()}_${i}.mp3`);

      const response = await axios({
        url,
        method: "GET",
        responseType: "arraybuffer"
      });

      fs.writeFileSync(filePath, response.data);
      files.push(filePath);
    }

    // 🔥 STEP 2: MERGE ALL FILES
    const finalPath = path.join(__dirname, `final_${Date.now()}.mp3`);
    const writeStream = fs.createWriteStream(finalPath);

    for (const file of files) {
      const data = fs.readFileSync(file);
      writeStream.write(data);
      fs.unlinkSync(file); // delete chunk
    }

    writeStream.end();

    // 🔥 STEP 3: SEND FINAL AUDIO
    writeStream.on("finish", () => {
      res.download(finalPath, "voxify.mp3", () => {
        fs.unlinkSync(finalPath);
      });
    });

  } catch (err) {
    console.error("TTS ERROR:", err);
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

// 🚀 START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
