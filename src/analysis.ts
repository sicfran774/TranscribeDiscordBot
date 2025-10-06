import fs from "fs";
import path from "path";
import { Conversation } from "./data";

function setupConversationRead(guildId: string, channelId: string, chatStartTimestamp: string){
    const conversationPath = path.join(process.cwd(), "data", guildId, channelId, chatStartTimestamp, "conversation.json");

    const conversationRaw = fs.readFileSync(conversationPath, 'utf-8');
    const conversationData: Conversation = JSON.parse(conversationRaw);
    return conversationData.conversation;
}

function countWords(guildId: string, channelId: string, chatStartTimestamp: string) {
    const conversation = setupConversationRead(guildId, channelId, chatStartTimestamp);

    const userCounts = new Map<string, Map<string, number>>();
    const totalCounts = new Map<string, number>();

    for (const message of conversation) {
        const username = message.username;
        const words = message.words.split(/\s+/);

        if (!userCounts.has(username)) {
            userCounts.set(username, new Map<string, number>());
        }

        const wordMap = userCounts.get(username)!;

        for (let word of words) {
            // Normalize: lowercase and remove punctuation
            const cleanWord = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"“”]/g, "");

            if (!cleanWord) continue; // skip if it's now empty

            // per-user
            wordMap.set(word, (wordMap.get(word) || 0) + 1);
            // total
            totalCounts.set(word, (totalCounts.get(word) || 0) + 1);
        }
    }

    // Build per-user sorted arrays
    const wordsPerUser = [];
    for (const [username, wordMap] of userCounts.entries()) {
        const words: { word: string; count: number }[] = [];
        for (const [word, count] of wordMap.entries()) {
            words.push({ word, count });
        }
        const sortedWordCounts = words.sort((a, b) => b.count - a.count);
        wordsPerUser.push({ username, words: sortedWordCounts });
    }

    // Build global sorted array
    const sortedTotalCounts = Array.from(totalCounts.entries())
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count);

    return {
        total: sortedTotalCounts,
        perUser: wordsPerUser,
    };
}


export async function wordMessage(session: { guildId: string, channelId: string, chatStartTimestamp: string }){
    const messages: string[] = [];

    // total top words
    const wordCounts = countWords(session.guildId, session.channelId, session.chatStartTimestamp);
    
    const firstTenWords = wordCounts.total.slice(0, 10);
    const topWordsStr = firstTenWords.map((word, index) => ` ${word.word} (${word.count}x)`);
    const topWordsMessage = "**Top 10 words said in this conversation**\n" +
                            topWordsStr + "\n\n";

    messages.push(topWordsMessage);

    // top words per user
    const topWordsPerUser: { username: string, topWords: { word: string, count: number }[] }[] = [];
    

    for (const user of wordCounts.perUser){
        const username = user.username;
        const topWords = user.words.slice(0, 10);

        topWordsPerUser.push({
            username,
            topWords
        })
    }

    messages.push("**Top 10 words said each person said**\n")


    for (const user of topWordsPerUser) {
        messages.push(`__${user.username}__\n`);

        const topWordsPerUserStr: string[] = [];

        user.topWords.forEach((word, index) => {
            topWordsPerUserStr.push(`${word.word} (${word.count}x)`);
        });

        messages.push(topWordsPerUserStr.join(", "));
    }

    return messages;
}