import fs from "fs";

export async function transcribeAudio() {
    const speech = require('@google-cloud/speech');
    const client = new speech.SpeechClient();

    // Read the PCM file directly
    const pcmBuffer = fs.readFileSync("recordings/472523152430465056-1759298970673.pcm");

    // Convert PCM to base64
    const audio = {
        content: pcmBuffer.toString("base64"),
    };

    // Configure STT
    const config = {
        encoding: "LINEAR16",       // PCM format
        sampleRateHertz: 48000,     // must match your PCM
        languageCode: "en-US",
        model: "phone_call",            // or 'phone_call' if suitable
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

    console.log(`Transcription: ${transcription}`);

    // Save transcription to a file
    const outputFilePath = "recordings/transcription.txt";
    fs.writeFileSync(outputFilePath, transcription, { encoding: "utf8" });

    console.log(`Transcription saved to ${outputFilePath}`);
}
