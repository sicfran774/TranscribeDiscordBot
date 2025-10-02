import fs from "fs";
import path from "path";

const speech = require('@google-cloud/speech');
const client = new speech.SpeechClient();

// Configure STT
const config = {
    encoding: "LINEAR16",
    sampleRateHertz: 48000,
    languageCode: "en-US",
    model: "latest_long"
};

export async function transcribeAudio(audioPath: string, transcriptPath: string, timestamp: string, username: string) {
    const pcmBuffer = fs.readFileSync(audioPath);

    // Convert PCM to base64
    const audio = {
        content: pcmBuffer.toString("base64"),
    };

    const request = {
        config,
        audio,
    };

    // Send to Google STT
    const [response] = await client.recognize(request);
    // Build transcription text
    const transcription = response.results
        .map((result: any) => result.alternatives[0].transcript)
        .join("\n");

    console.log(`${username} said: ${transcription}`);

    // Save transcription
    const outputFilePath = path.join(transcriptPath, `${timestamp}.txt`);
    fs.writeFileSync(outputFilePath, transcription, { encoding: "utf8" });

    //console.log(`Transcription saved to ${outputFilePath}`);
}
