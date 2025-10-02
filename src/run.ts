import { Client, GatewayIntentBits, Message, OmitPartialGroupDMChannel, VoiceBasedChannel } from "discord.js";
import { getVoiceConnection, joinVoiceChannel, EndBehaviorType, entersState, VoiceConnectionStatus } from "@discordjs/voice";
import dotenv from "dotenv";
import { pipeline } from "stream";
import fs from "fs";
import path from "path";
import prism from "prism-media";
import { transcribeAudio } from "./transcribe";

async function createDirectory(folderPath: string): Promise<void> {
    const dir = path.join(process.cwd(), folderPath);
    await fs.promises.mkdir(dir, { recursive: true });
    console.log("Directory created:", dir);
}

async function joinAndListen(channel: VoiceBasedChannel, message: OmitPartialGroupDMChannel<Message<boolean>>) {
    const guild = message.guild;
    const guildId = guild!.id;

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false, // must be false to receive audio
    });

    try {
        // wait for the connection to be ready before accessing receiver
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (err) {
        console.error("Failed to enter Ready state:", err);
        connection.destroy();
        return;
    }

    const receiver = connection.receiver; // VoiceReceiver
    console.log("Receiver ready:", !!receiver);

    const chatStartTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const vcSessionPath = path.join("data", guildId, chatStartTimestamp);
    await createDirectory(vcSessionPath);

    const initializedUsers = new Set<string>(); // Prevents creating directories/starting listeners repeatedly
    const speakingUsers = new Set<string>();

    receiver.speaking.on("start", async (userId) => {
        try {
            const member = await guild!.members.fetch(userId);
            const username = member.user.username;

            if (speakingUsers.has(userId)) {
                return;
            }
            speakingUsers.add(userId);

            if (!initializedUsers.has(username)) {
                const userPath = path.join(vcSessionPath, username);
                const userRecordingPath = path.join(userPath, "recordings");
                const userTranscriptPath = path.join(userPath, "transcripts");

                console.log(`Attempting to create folders for ${username}...`)
                await Promise.all([
                    createDirectory(userRecordingPath),
                    createDirectory(userTranscriptPath)
                ]);
                console.log(`✅Successfully created folders for ${username}!`)

                initializedUsers.add(username);
            }

            const timestamp = new Date();
            const timestampStr = timestamp.toISOString().replace(/[:.]/g, "-");

            const userRecordingPath = path.join(vcSessionPath, username, "recordings");
            const userTranscriptPath = path.join(vcSessionPath, username, "transcripts");

            const opusStream = receiver.subscribe(userId, {
                end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
            });

            const pcmFilePath = path.join(userRecordingPath, `${timestampStr}.pcm`);
            const pcmFile = fs.createWriteStream(pcmFilePath);

            const decoder = new prism.opus.Decoder({
                frameSize: 960,
                channels: 1,
                rate: 48000,
            });

            pipeline(opusStream, decoder, pcmFile, (err) => {
                speakingUsers.delete(userId);
                opusStream.destroy();
                decoder.destroy();
                if (err) {
                    console.error("Error saving PCM:", err);
                } else {
                    //console.log(`Saved PCM recording: ${pcmFilePath}`);
                    transcribeAudio(pcmFilePath, userTranscriptPath, timestampStr, username);
                }
            });

        } catch (err) {
            console.error("Failed to get username for userId:", userId, err);
        }
    });
}

dotenv.config(); // loads .env file

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
});

client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user?.tag}!`);
});

client.on("messageCreate", (message) => {
    if (message.author.bot) return;

    if (message.content === "!join") {
        const user = message.member; // Non-null if in server (not DM)

        if (!user || !("voice" in user)){
            message.reply("❗ You must be in a server to use this command. ❗");
            return;
        }

        const voiceChannel = user.voice.channel;

        if (!voiceChannel){
            message.reply("❗ You need to join a voice channel first! ❗")
            return;
        }

        // Join voice chat
        joinAndListen(voiceChannel, message);
        message.reply(`Joined ${voiceChannel.name}!`)
    }

    if (message.content === "!leave") {
        const connection = getVoiceConnection(message.guild!.id);

        if (connection) {
            connection.destroy();
            message.reply("Left the voice channel!");
        } else {
            message.reply("I'm not in a voice channel.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
