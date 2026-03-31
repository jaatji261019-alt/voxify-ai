const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const gTTS = require("gtts");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/tts", (req, res) => {
  try {
    const { text, lang } = req.body;

    if (!text) return res.status(400).send("No text");

    const filePath = path.join(__dirname, "output.mp3");

    const gtts = new gTTS(text, lang || "en");

    gtts.save(filePath, () => {
      res.download(filePath, "voxify.mp3", () => {
        fs.unlinkSync(filePath); // delete after send
      });
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating audio");
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
