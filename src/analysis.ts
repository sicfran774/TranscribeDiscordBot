import fs from "fs";
import path from "path";
import { Conversation } from "./data";

function countWords(guildId: string, channelId: string, chatStartTimestamp: string){
    const conversationPath = path.join(process.cwd(), "data", guildId, channelId, chatStartTimestamp, "conversation.json");

    const conversationRaw = fs.readFileSync(conversationPath, 'utf-8');
    const conversationData: Conversation = JSON.parse(conversationRaw);
    const conversation = conversationData.conversation;

    const wordCounts = new Map<string, number>();

    for (const message of conversation){
        const words = message.words.split(/\s+/)

        for (let word of words){
            word = word.toLowerCase();
            if(!word) continue;

            wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
    }

    const sortedWordCounts = Array.from(wordCounts.entries())
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count);

    return sortedWordCounts;
}

export async function wordMessage(session: { guildId: string, channelId: string, chatStartTimestamp: string }){
    const wordCounts = countWords(session.guildId, session.channelId, session.chatStartTimestamp);
    
    const firstTenWords = wordCounts.slice(0, 10);
    const beautify = firstTenWords.map((word) => `${word.word}: ${word.count} times`)
    const finalMessage = beautify.join("\n");
    return finalMessage;
}