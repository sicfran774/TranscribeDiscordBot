from flask import Flask, request, jsonify
import wave
import tempfile
import os
import whisper

app = Flask(__name__)

# "base" is default
model = whisper.load_model("base")

@app.route("/transcribe", methods=["POST"])
def transcribe():
    try:
        if request.content_type != "audio/pcm":
            return jsonify({"error": "Unsupported Content-Type. Use audio/pcm"}), 400

        pcm_data = request.data
        if not pcm_data:
            return jsonify({"error": "No audio data received"}), 400

        print(f"Received PCM bytes: {len(pcm_data)}")

        # Convert PCM → WAV so Whisper can read it
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_file:
            with wave.open(wav_file, "wb") as wf:
                wf.setnchannels(1)        # mono
                wf.setsampwidth(2)        # 16-bit
                wf.setframerate(48000)    # 48kHz
                wf.writeframes(pcm_data)
            wav_path = wav_file.name

        # Transcribe locally
        result = model.transcribe(wav_path, fp16=False)

        # Clean up temporary WAV
        os.remove(wav_path)

        return jsonify({"text": result["text"].strip()})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Run Flask server
    app.run(host="0.0.0.0", port=5000)
