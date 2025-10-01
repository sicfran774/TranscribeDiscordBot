import { Client, GatewayIntentBits, VoiceBasedChannel } from "discord.js";
import { getVoiceConnection, joinVoiceChannel, EndBehaviorType, entersState, VoiceConnectionStatus } from "@discordjs/voice";
import dotenv from "dotenv";
import { pipeline } from "stream";
import fs from "fs";
import prism from "prism-media";

export async function joinAndListen(channel: VoiceBasedChannel) {
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
    receiver.speaking.on("start", (userId) => {
        console.log(`User ${userId} started speaking`);
        const opusStream = receiver.subscribe(userId, {
            end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
        });

        const pcmFile = fs.createWriteStream(`./recordings/${userId}-${Date.now()}.pcm`);
        const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });
        pipeline(opusStream, decoder, pcmFile, (err) => {
            if (err) console.error("Error saving PCM:", err);
            else console.log("Saved PCM recording");
        });
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
        joinAndListen(voiceChannel);
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
