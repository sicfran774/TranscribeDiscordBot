import { Message } from "discord.js";


export async function analyzeWordleResults(messages: Message[]){
    const users = new Map<string, Map<string, number>>();
    const streaks = new Map<string, number>();
    const leastGuesses = new Map<string, number>();

    messages.forEach(message => {
        //console.log(message.createdAt.toString());
        let lines = message.content.split("\n");
        lines = lines.slice(1);
        lines.forEach(line => {
            const result = line.split(" ");
            let guesses = "";
            let i = 1;
            if(result[0] === "👑"){
                guesses = result[1].split("")[0];
                i = 2;
            } else {
                guesses = result[0].split("")[0];
            }

            const names = result.slice(i);

            names.forEach(user => {
                if(!users.has(user)){
                    users.set(user, new Map<string, number>());
                }

                const userStats = users.get(user);
                userStats?.set(guesses, (userStats.get(guesses) || 0) + 1);
                if(guesses !== "X"){
                    streaks.set(user, (streaks.get(user) || 0) + 1);

                    if(i === 2) { // crown, so they won that day
                        leastGuesses.set(user, (leastGuesses.get(user) || 0) + 1);
                    }
                } else {
                    streaks.set(user, 0);
                }
            })
        })
    });

    let message = "";
    for(const [user, data] of users){
        const stats = new Map<string, string>();

        let totalPlays = 0;
        for(const [guess, amount] of data){
            totalPlays += amount;
        }

        const losses = (data.get("X") || 0);
        const wins = totalPlays - losses;
        stats.set("W/L", `${wins}/${losses} (${(wins / totalPlays) * 100}%)`)

        for(const [guess, amount] of data){
            stats.set(`${guess}/6`, `${amount} (${((amount / totalPlays) * 100).toFixed(2)}%)`)
        }

        message += `${user}: \n`;
        message += `Current streak: ${streaks.get(user)} \n`;
        message += `Days won: ${(leastGuesses.get(user) || 0)} \n`
        for(const [stat, value] of stats){
            message += `${stat}: ${value} \n`;
        }
        message += "\n";
    }

    return message;
}