const textEl = document.getElementById("text");
const player = document.getElementById("player");

// ===== Chunking =====
function chunkText(text, size = 300) {
  let chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

// ===== Preview =====
function preview() {
  const text = textEl.value || "This is preview";

  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = "en-US";

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(speech);
}

// ===== Generate =====
async function generate() {
  if (!textEl.value) return alert("Enter text");

  const chunks = chunkText(textEl.value);

  const res = await fetch("http:// https://voxify-ai.onrender.com/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chunks }),
  });

  const blob = await res.blob();
  player.src = URL.createObjectURL(blob);
}

// ===== Download =====
function download() {
  const a = document.createElement("a");
  a.href = player.src;
  a.download = "voxify.mp3";
  a.click();
}
