import { Client, GatewayIntentBits, VoiceBasedChannel } from "discord.js";
import { getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
import dotenv from "dotenv";
import { connect } from "http2";

const connectToVC = (channel: VoiceBasedChannel) => {
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false, // whether the bot deafens itself
    });

    return connection;
}

dotenv.config(); // loads .env file

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("ready", () => {
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
    connectToVC(voiceChannel);
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
