import { Client, GatewayIntentBits, Message, OmitPartialGroupDMChannel, VoiceBasedChannel } from "discord.js";
import { getVoiceConnection, joinVoiceChannel, EndBehaviorType, entersState, VoiceConnectionStatus } from "@discordjs/voice";
import dotenv from "dotenv";
import { pipeline } from "stream";
import fs from "fs";
import prism from "prism-media";
import { transcribeAudio } from "./transcribe";

export async function joinAndListen(channel: VoiceBasedChannel, message: OmitPartialGroupDMChannel<Message<boolean>>) {
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false, // important: must be false to receive audio
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

    // when someone starts speaking
    receiver.speaking.on("start", async (userId) => {
        try {
            // Get the guild member to access their username
            const member = await message.guild!.members.fetch(userId);
            const username = member.user.username;

            // Create a readable timestamp
            const timestamp = new Date();
            const timestampStr = timestamp.toISOString().replace(/[:.]/g, "-"); 
            // replace colon and dot for filesystem-safe filenames

            console.log(`User ${username} started speaking at ${timestamp.toLocaleString()}`);

            const opusStream = receiver.subscribe(userId, {
                end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
            });

            // Filename uses username and human-readable timestamp
            const pcmFilePath = `./recordings/${username}-${timestampStr}.pcm`;
            const pcmFile = fs.createWriteStream(pcmFilePath);

            const decoder = new prism.opus.Decoder({
                frameSize: 960,
                channels: 2,
                rate: 48000,
            });

            pipeline(opusStream, decoder, pcmFile, (err) => {
                if (err) console.error("Error saving PCM:", err);
                else console.log(`Saved PCM recording: ${pcmFilePath}`);
            });
        } catch (err) {
            console.error("Failed to get username for userId:", userId, err);
        }
    });

    receiver.speaking.on("end", (userId: string) => {
        console.log(`User ${userId} stopped speaking`);
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

    if (message.content === "!test") {
        message.reply("Attempting STT...");
        transcribeAudio();
    }
});

client.login(process.env.DISCORD_TOKEN);
