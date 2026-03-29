const express = require("express");
const cors = require("cors");
const fs = require("fs");
const gTTS = require("gtts");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

function createChunk(text, i) {
  return new Promise((resolve, reject) => {
      const file = `chunk_${i}.mp3`;
          new gTTS(text, "en").save(file, (err) => {
                if (err) reject(err);
                      else resolve(file);
                          });
                            });
                            }

                            app.post("/tts", async (req, res) => {
                              try {
                                  const { chunks } = req.body;

                                      const files = [];

                                          for (let i = 0; i < chunks.length; i++) {
                                                const file = await createChunk(chunks[i], i);
                                                      files.push(file);
                                                          }

                                                              fs.writeFileSync("list.txt", files.map(f => `file '${f}'`).join("\n"));

                                                                  ffmpeg()
                                                                        .input("list.txt")
                                                                              .inputOptions(["-f concat", "-safe 0"])
                                                                                    .outputOptions(["-c copy"])
                                                                                          .on("end", () => {
                                                                                                  res.download("output.mp3");

                                                                                                          files.forEach(f => fs.unlinkSync(f));
                                                                                                                  fs.unlinkSync("list.txt");
                                                                                                                        })
                                                                                                                              .on("error", err => res.status(500).send(err.message))
                                                                                                                                    .save("output.mp3");

                                                                                                                                      } catch (err) {
                                                                                                                                          res.status(500).send(err.message);
                                                                                                                                            }
                                                                                                                                            });

                                                                                                                                            app.listen(3000, () => console.log("Server running"));