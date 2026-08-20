import { performance } from "perf_hooks";
import { utilityCmd } from "../types.js";

export const PingCmd = utilityCmd({
  trigger: ["ping", "pong"],
  description: "Show the bot's gateway and round-trip latency",
  permission: "can_ping",

  async run({ message: msg, pluginData }) {
    const start = performance.now();
    const reply = await msg.channel.send("Pinging...");
    const roundTrip = Math.round(performance.now() - start);

    await reply.edit(`Pong! Gateway: **${pluginData.client.ws.ping}ms** — Round-trip: **${roundTrip}ms**`);
  },
});
