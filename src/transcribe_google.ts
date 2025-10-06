import fs from "fs";
import path from "path";

const speech = require('@google-cloud/speech');
const client = new speech.SpeechClient();

// Configure STT
const config = {
    encoding: "LINEAR16",
    sampleRateHertz: 48000,
    languageCode: "en-US",
    model: "latest_long",
    audioChannelCount: 1,
    enableSeparateRecognitionPerChannel: false,
};

export async function transcribeAudio(audioPath: string, transcriptPath: string, timestamp: string, username: string) {
    try {
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

        if (transcription.trim().length === 0){
            return;
        }

        console.log(`${username}: ${transcription}`);

        // Save transcription
        const outputFilePath = path.join(transcriptPath, `${timestamp}.txt`);
        fs.writeFileSync(outputFilePath, transcription, { encoding: "utf8" });

        //console.log(`Transcription saved to ${outputFilePath}`);
    } catch (e) {
        console.error(`Transcription error caught: ${e}`);
    }
}
