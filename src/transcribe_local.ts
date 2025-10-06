import fs from "fs";
import path from "path";
import fetch from "node-fetch"; // make sure to npm install node-fetch

// You can point this to wherever your Flask app will run
const TRANSCRIBE_URL = "http://localhost:5000/transcribe";

export async function transcribeAudio(
  audioPath: string,
  transcriptPath: string,
  timestamp: string,
  username: string
) {
  try {
    const pcmBuffer = fs.readFileSync(audioPath);
    const stats = fs.statSync(audioPath);
    if (stats.size < 1000) {
      console.warn(`[WARN] ${audioPath} is too small (${stats.size} bytes). Skipping transcription.`);
      return;
    }

    // Send raw PCM to your Python backend
    const res = await fetch(TRANSCRIBE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "audio/pcm",
      },
      body: pcmBuffer,
    });

    if (!res.ok) {
      throw new Error(`Transcriber HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { text: string };
    const transcription = (data.text || "").trim();

    console.log(`${username}: ${transcription}`);

    // Save locally
    const outputFilePath = path.join(transcriptPath, `${timestamp}.txt`);
    fs.writeFileSync(outputFilePath, transcription, { encoding: "utf8" });

  } catch (e) {
    console.error(`Transcription error caught: ${e}`);
  }
}
