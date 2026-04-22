const textEl = document.getElementById("text");
const player = document.getElementById("player");

let currentAudioURL = null;

// 🔥 BACKEND URL (yahi change hota hai future me)
const BASE_URL = "https://voxify-ai.onrender.com";

// 🌍 LANGUAGE DETECT
function detectLanguage(text) {
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  return "en";
}

// 🔊 PREVIEW
function preview() {
  const text = textEl.value || "This is preview";

  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = detectLanguage(text);

  speechSynthesis.cancel();
  speechSynthesis.speak(speech);
}

function stopPreview() {
  speechSynthesis.cancel();
}

// 🎧 GENERATE AUDIO
async function generate() {
  if (!textEl.value.trim()) return alert("Enter text");

  try {
    const res = await fetch(`${BASE_URL}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: textEl.value,
        lang: detectLanguage(textEl.value)
      })
    });

    if (!res.ok) throw new Error("TTS failed");

    const blob = await res.blob();

    if (currentAudioURL) {
      URL.revokeObjectURL(currentAudioURL);
    }

    currentAudioURL = URL.createObjectURL(blob);
    player.src = currentAudioURL;

    await player.play().catch(() => {});

  } catch (err) {
    console.error(err);
    alert("Audio generation failed ❌");
  }
}

// 📥 DOWNLOAD AUDIO
function download() {
  if (!currentAudioURL) return alert("Generate audio first!");

  const a = document.createElement("a");
  a.href = currentAudioURL;
  a.download = "voxify.mp3";
  a.click();
}

// 🎛 AUDIO CONTROLS
function playAudio() {
  if (!player.src) return alert("Generate audio first!");
  player.play();
}

function pauseAudio() {
  player.pause();
}

function stopAudio() {
  player.pause();
  player.currentTime = 0;
}

// 🎬 CINEMATIC VIDEO (CONNECTED TO SAME BACKEND)
async function createVideo() {
  if (!currentAudioURL) return alert("Generate audio first!");

  try {
    const audioBlob = await fetch(currentAudioURL).then(r => r.blob());

    const formData = new FormData();
    formData.append("audio", audioBlob);
    formData.append("text", textEl.value);

    const res = await fetch(`${BASE_URL}/cinematic-video`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) throw new Error("Video failed");

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    // 🎬 preview
    const videoPlayer = document.getElementById("videoPlayer");
    if (videoPlayer) {
      videoPlayer.src = url;
      videoPlayer.style.display = "block";
    }

    // 📥 download
    const a = document.createElement("a");
    a.href = url;
    a.download = "cinematic.mp4";
    a.click();

  } catch (err) {
    console.error(err);
    alert("Video generation failed ❌");
  }
}
