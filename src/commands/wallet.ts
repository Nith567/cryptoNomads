import { SlashCommandBuilder } from "discord.js";

export const walletCommand = new SlashCommandBuilder()
  .setName("wallet")
  .setDescription("Manage your crypto wallet")
  .addSubcommand(subcommand =>
    subcommand
      .setName("create")
      .setDescription("Create a new wallet")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("balance")
      .setDescription("Check your wallet balance")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("address")
      .setDescription("Get your wallet address")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("send")
      .setDescription("Send ETH to another address")
      .addStringOption(option =>
        option
          .setName("to")
          .setDescription("Recipient address")
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName("amount")
          .setDescription("Amount of ETH to send")
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("history")
      .setDescription("View your transaction history")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("export")
      .setDescription("🚨 Export your private key (DANGER: Use with extreme caution!)")
  );
