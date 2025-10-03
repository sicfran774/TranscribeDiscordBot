import { Client, GatewayIntentBits, Message, OmitPartialGroupDMChannel, VoiceBasedChannel } from "discord.js";
import { getVoiceConnection, joinVoiceChannel, EndBehaviorType, entersState, VoiceConnectionStatus } from "@discordjs/voice";
import dotenv from "dotenv";
import { pipeline } from "stream";
import fs from "fs";
import path from "path";
import prism from "prism-media";
import { transcribeAudio } from "./transcribe";
import { aggregateData } from "./data";
import { wordMessage } from "./analysis";

async function createDirectory(folderPath: string): Promise<void> {
    const dir = path.join(process.cwd(), folderPath);
    await fs.promises.mkdir(dir, { recursive: true });
    console.log("Directory created:", dir);
}

let startShutdown = false;

async function joinAndListen(channel: VoiceBasedChannel) {
    const guild = channel.guild;
    const guildId = guild.id;
    const channelId = channel.id

    const connection = joinVoiceChannel({
        channelId: channelId,
        guildId: guildId,
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
    const vcSessionPath = path.join("data", guildId, channelId, chatStartTimestamp);
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
                const userPath = path.join(vcSessionPath, username.replace(/[. ]+$/, ""));
                const userRecordingPath = path.join(userPath, "recordings");
                const userTranscriptPath = path.join(userPath, "transcripts");

                console.log(`Attempting to create folders for ${username}...`)
                await Promise.all([
                    createDirectory(userRecordingPath),
                    createDirectory(userTranscriptPath)
                ]);
                console.log(`✅ Successfully created folders for ${username}!`)

                initializedUsers.add(username);
            }

            const timestamp = new Date();
            const timestampStr = timestamp.toISOString().replace(/[:.]/g, "-");

            const userRecordingPath = path.join(vcSessionPath, username, "recordings");
            const userTranscriptPath = path.join(vcSessionPath, username, "transcripts");

            const opusStream = receiver.subscribe(userId, {
                end: { behavior: EndBehaviorType.AfterSilence, duration: 500 },
            });

            const pcmFilePath = path.join(userRecordingPath, `${timestampStr}.pcm`);
            const pcmFile = fs.createWriteStream(pcmFilePath);

            const decoder = new prism.opus.Decoder({
                frameSize: 960,
                channels: 1,
                rate: 48000,
            });

            pipeline(opusStream, decoder, pcmFile, async (err) => {
                speakingUsers.delete(userId);
                opusStream.destroy();
                decoder.destroy();
                if (err) {
                    console.error("Error saving PCM:", err);
                } else {
                    //console.log(`Saved PCM recording: ${pcmFilePath}`);
                    await transcribeAudio(pcmFilePath, userTranscriptPath, timestampStr, username);
                }
            });

            pcmFile.on("finish", () => {
                if(startShutdown){
                    connection.destroy();
                }
            })

        } catch (err) {
            console.error("Failed to get username for userId:", userId, err);
        }
    });

    // Return session info
    return {
        guildId,
        channelId,
        chatStartTimestamp
    };
}

dotenv.config(); // loads .env file
let activeSessions = new Map<string, { guildId: string, channelId: string, chatStartTimestamp: string }>();

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

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.content === "!join") {
        const user = message.member; // Non-null if in server (not DM)

        if (!user?.voice.channel){
            message.reply("❌ You must be in a server to use this command.");
            return;
        }

        const voiceChannel = user.voice.channel!;

        if (activeSessions.has(message.guild!.id)){
            message.reply("❌ I'm already in a voice chat! Please wait until I leave and transcribe the conversation.")
            return;
        }

        // Join voice chat
        startShutdown = false;
        const session = await joinAndListen(voiceChannel);
        if (session) {
            activeSessions.set(message.guild!.id, session);
            message.reply(`Joined ${voiceChannel.name}!`);
        } else {
            message.reply("Failed to join the voice channel.");
        }
    }

    if (message.content === "!leave") {
        const connection = getVoiceConnection(message.guild!.id);

        if (connection) {
            startShutdown = true;
            message.reply("Left the voice channel! Processing results...");

            const session = activeSessions.get(message.guild!.id);
            if (session){
                await aggregateData(session);
                activeSessions.delete(message.guild!.id);
                message.reply("✅ Transcript processing complete!")
                const messageStrs = await wordMessage(session);

                if (messageStrs) {
                    for (const s of messageStrs){
                        message.channel.send(s);
                    }
                } else {
                    message.reply("😢 Error sending word analysis. Sorry.")
                }
            }

        } else {
            message.reply("I'm not in a voice channel.");
        }
    }

    if (message.content.startsWith("!process")){
        const args = message.content.trim().split(" ").slice(1);
        
        if(args.length > 1){
            const guildId = message.guild!.id;
            if (!guildId) {
                message.reply("❌ You must be in a server to use this command.");
            }
            try{
                const session = {
                    guildId: guildId,
                    channelId: args[0],
                    chatStartTimestamp: args[1]
                }

                console.log(session);

                await aggregateData(session);

                const messageStrs = await wordMessage(session);

                if (messageStrs) {
                    for (const s of messageStrs){
                        message.channel.send(s);
                    }
                } else {
                    message.reply("😢 Error sending word analysis. Sorry.")
                }
            } catch (e) {
                console.log(e);
                message.reply("Invalid conversation! Whoops.");
            }
        } else {
            message.reply("Please specify the channel ID and date of conversation.\n!process [channel ID] [conversation date]");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
// ffmpeg -f s16le -ar 48k -ac 1 -i .pcm .wav