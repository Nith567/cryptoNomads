import { SlashCommandBuilder } from "discord.js";

export const askCommand = new SlashCommandBuilder()
  .setName("ask")
  .setDescription(
    "Ask Brian a question. Brian will generate a response based on the prompt."
  )
  .addStringOption((option) =>
    option
      .setName("input")
      .setDescription("The prompt that will be sent to Brian.")
      .setRequired(true)
  );
