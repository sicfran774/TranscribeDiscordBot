import fs from "fs";
import path from "path";

function initializeJSON(serverId: string, channelId: string, conversationStart: string){
    const initialData: Conversation = {
        "guildId": serverId,
        "channelId": channelId,
        "conversationStart": conversationStart,
        "conversation": []
    };
    return initialData;
}

export type Conversation = { 
    guildId: string, 
    channelId: string, 
    conversationStart: string, 
    conversation: Spoken[] 
}

// structure for each point in conversation
export type Spoken = {
    username: string;
    start: string;
    words: string;
}

async function buildConversation(json: { guildId: string, channelId: string, conversationStart: string, conversation: Spoken[] }, conversationPath: string){
    const conversation: Spoken[] = [];

    // traverse usernames
    const usernames = fs.readdirSync(conversationPath);
    for (const username of usernames){
        const transcriptsPath = path.join(conversationPath, username, "transcripts");
        if (!fs.existsSync(transcriptsPath)) continue;

        const files = fs.readdirSync(transcriptsPath);
        for (const file of files) {
            if (!file.endsWith(".txt")) continue;

            const start = path.basename(file, ".txt"); // Strips .txt and gets only timestamp
            const words = fs.readFileSync(path.join(transcriptsPath, file), "utf-8").trim(); // Words inside of file

            conversation.push({ username, start, words });
        }
    }

    function parseDate(date: string){
        return new Date(date.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z'));
    }

    // sort by timestamp
    conversation.sort(
        (a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime()
    );

    // Set "conversation" to initialized JSON
    json.conversation = conversation;

    const outputPath = path.join(conversationPath, "conversation.json");
    fs.writeFileSync(outputPath, JSON.stringify(json, null, 2), "utf-8");
    console.log(`Conversation JSON saved to ${outputPath}`);
}

export async function aggregateData(session: { guildId: string, channelId: string, chatStartTimestamp: string }){
    const json = initializeJSON(session.guildId, session.channelId, session.chatStartTimestamp);

    const conversationPath = path.join(process.cwd(), "data", session.guildId, session.channelId, session.chatStartTimestamp);

    await buildConversation(json, conversationPath);
}