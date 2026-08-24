const { 
  Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, 
  ButtonStyle, EmbedBuilder, ChannelType, SlashCommandBuilder, REST, Routes, 
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ModalBuilder, TextInputBuilder, 
  TextInputStyle, AttachmentBuilder, MessageType, ActivityType 
} = require('discord.js');
require('dotenv').config();
const fs = require('fs');

const OWNER_IDS = ['1527769881326522478', '1533306874513068093'];

// Emojis Personalizados Mapeados
const EMOJIS = {
  config: '<:config:1534611990633250937>',
  gerenciar: '<:gerenciar:1540870215640809482>',
  perfil: '<:perfil:1540557352602705990>',
  id: '<:ID:1534611999085039786>',
  horario: '<:horrio:1534611997335883886>',
  user: '<:user:1539125800907968603>',
  passarposse: '<:passarposse:1539125801851813970>',
  suporte: '<:suporte:1539845832004870154>',
  avisos: '<:avisos:1539125781320433724>',
  linkexterno: '<:linkexterno:1539124690709385330>',
  setinha: '<:setinha:1539125798462685316>',
  not: '<:not:1539815573981237388>',
  zyphor: '<:zyphor:1540096483276095621>',
  proibido: '<:Proibido:1534611991929290877>',
  fechar: '<:fechar:1541318085435199569>',
  atender: '<:atender:1541318084210720799>',
  fixo: '<:fixo:1541318082574684240>'
};

let config = fs.existsSync('./config.json') ? JSON.parse(fs.readFileSync('./config.json')) : { 
  title: "Central de Atendimento", 
  desc: `${EMOJIS.setinha} Precisa de ajuda ou suporte?\n\n${EMOJIS.setinha} Clique no botão abaixo para abrir um ticket privado.`, 
  img: "", thumb: "", targetChannelId: "", logChannelId: "",
  staffRoles: [], streamText: "Zyphor Apps • Atendimento"
};

let db = fs.existsSync('./database.json') ? JSON.parse(fs.readFileSync('./database.json')) : { tickets: {}, userTickets: {} };

const salvarCfg = () => fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
const salvarDB = () => fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));

function isStaff(member) {
  if (OWNER_IDS.includes(member.id)) return true;
  if (config.staffRoles && member.roles.cache.some(r => config.staffRoles.includes(r.id))) return true;
  return false;
}

function atualizarPresence(client, texto) {
  client.user.setActivity(texto, {
    type: ActivityType.Streaming,
    url: 'https://www.twitch.tv/discord'
  });
}

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ] 
});

const commands = [
  new SlashCommandBuilder().setName('config').setDescription('Abre o painel interativo de configuração'),
  new SlashCommandBuilder().setName('enviar').setDescription('Envia o painel de tickets no canal')
];

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  
  // Ativa o Status de Streaming
  atualizarPresence(client, config.streamText || "Zyphor Apps • Suporte");
  console.log(`🤖 Bot Zyphor Suporte Online: ${client.user.tag}`);
});

// Remove mensagens do sistema de entrada no tópico
client.on(Events.MessageCreate, async m => {
  const systemTypes = [
    MessageType.RecipientAdd,
    MessageType.UserJoin,
    MessageType.ThreadMembersUpdate
  ];

  if (systemTypes.includes(m.type)) {
    return m.delete().catch(() => {});
  }
});

client.on(Events.ThreadDelete, (thread) => {
  for (const userId in db.userTickets) {
    if (db.userTickets[userId] === thread.id) { 
      delete db.userTickets[userId]; 
      delete db.tickets[thread.id]; 
      salvarDB(); 
    }
  }
});

async function encerrarEExcluirTicket(channel, encarregadoId) {
  const t = db.tickets[channel.id];
  if (!t) return;

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const logText = messages.reverse().map(m => `[${m.createdAt.toLocaleString('pt-BR')}] ${m.author.tag}: ${m.content}`).join('\n');
    const buffer = Buffer.from(logText, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `log-${channel.name}.txt` });

    if (config.logChannelId) {
      const logChan = await client.channels.fetch(config.logChannelId).catch(() => null);
      if (logChan) {
        const embLog = new EmbedBuilder()
          .setTitle(`${EMOJIS.fechar} LOG DE TICKET ENCERRADO`)
          .setDescription(`${EMOJIS.setinha} **Tópico:** ${channel.name}\n${EMOJIS.user} **Autor:** <@${t.dono}>\n${EMOJIS.gerenciar} **Excluído por:** <@${encarregadoId}>`)
          .setColor(0x2b2d31);
        await logChan.send({ embeds: [embLog], files: [attachment] });
      }
    }
  } catch (e) {
    console.error("Erro ao gerar logs:", e);
  }

  delete db.userTickets[t.dono];
  delete db.tickets[channel.id];
  salvarDB();

  await channel.delete().catch(() => {});
}

// --- COMANDOS COM PREFIXO ( .f e z.s ) ---
client.on(Events.MessageCreate, async m => {
  if (m.author.bot) return;

  // Comando para mudar o texto da Stream
  if (m.content.toLowerCase().startsWith('z.s')) {
    if (!isStaff(m.member)) {
      return m.reply(`${EMOJIS.proibido} Você não tem permissão para alterar o status da stream!`);
    }

    const novoTexto = m.content.slice(3).trim();
    if (!novoTexto) {
      return m.reply(`${EMOJIS.proibido} Digite o texto desejado após o comando! Exemplo: \`z.s Meu Novo Status\``);
    }

    config.streamText = novoTexto;
    salvarCfg();

    atualizarPresence(client, novoTexto);
    return m.reply(`${EMOJIS.zyphor} Status de transmissão atualizado para: **${novoTexto}**`);
  }

  // Comando .f para fechar ticket
  if (m.content.startsWith('.')) {
    const args = m.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === 'f' && db.tickets[m.channel.id]) {
      if (!isStaff(m.member)) {
        return m.reply(`${EMOJIS.proibido} Apenas membros da equipe com cargo podem excluir este ticket!`);
      }
      return encerrarEExcluirTicket(m.channel, m.author.id);
    }
  }
});

// --- COMANDOS SLASH E INTERAÇÕES ---
client.on(Events.InteractionCreate, async int => {
  if (int.isChatInputCommand()) {
    if (int.commandName === 'config') {
      if (!OWNER_IDS.includes(int.user.id)) return int.reply({ content: `${EMOJIS.proibido} Apenas administradores.`, ephemeral: true });

      const embedCfg = new EmbedBuilder()
        .setTitle(`${EMOJIS.config} Configuração do Sistema de Tickets`)
        .setDescription("Ajuste os textos, imagens, canais e até 4 cargos de Staff abaixo:")
        .setColor(0x2b2d31);

      const rowBtns = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg_texts').setLabel('Editar Textos e Mídias').setStyle(ButtonStyle.Secondary).setEmoji('1534611990633250937'),
        new ButtonBuilder().setCustomId('cfg_view').setLabel('Ver Configurações').setStyle(ButtonStyle.Secondary).setEmoji('1540557352602705990')
      );

      const rowTarget = new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('cfg_target_chan').setPlaceholder('Selecione o Canal do Painel'));
      const rowLogs = new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('cfg_log_chan').setPlaceholder('Selecione o Canal de Logs'));
      const rowStaff = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_staff_roles').setPlaceholder('Cargos de Staff (Até 4)').setMinValues(1).setMaxValues(4));

      return int.reply({ embeds: [embedCfg], components: [rowBtns, rowTarget, rowLogs, rowStaff], ephemeral: true });
    }

    if (int.commandName === 'enviar') {
      if (!OWNER_IDS.includes(int.user.id)) return int.reply({ content: `${EMOJIS.proibido} Apenas administradores.`, ephemeral: true });

      const targetChan = config.targetChannelId ? await client.channels.fetch(config.targetChannelId).catch(() => null) : int.channel;
      
      const embed = new EmbedBuilder()
        .setTitle(config.title)
        .setDescription(config.desc)
        .setImage(config.img || null)
        .setThumbnail(config.thumb || null)
        .setColor(0x2b2d31);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('abrir_ticket').setLabel('Abrir Ticket').setStyle(ButtonStyle.Secondary).setEmoji('1539845832004870154')
      );

      await targetChan.send({ embeds: [embed], components: [row] });
      return int.reply({ content: `${EMOJIS.zyphor} Painel enviado em <#${targetChan.id}>!`, ephemeral: true });
    }
  }

  // --- CONFIGURAÇÃO ---
  if (int.isButton() && int.customId === 'cfg_texts') {
    const modal = new ModalBuilder().setCustomId('modal_cfg_texts').setTitle('Editar Painel de Tickets');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_title').setLabel('Título').setStyle(TextInputStyle.Short).setValue(config.title)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(config.desc)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_img').setLabel('URL Banner/Imagem').setStyle(TextInputStyle.Short).setValue(config.img).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_thumb').setLabel('URL Thumbnail').setStyle(TextInputStyle.Short).setValue(config.thumb).setRequired(false))
    );
    return int.showModal(modal);
  }

  if (int.isModalSubmit() && int.customId === 'modal_cfg_texts') {
    config.title = int.fields.getTextInputValue('t_title');
    config.desc = int.fields.getTextInputValue('t_desc');
    config.img = int.fields.getTextInputValue('t_img');
    config.thumb = int.fields.getTextInputValue('t_thumb');
    salvarCfg();
    return int.reply({ content: `${EMOJIS.zyphor} Textos e mídias salvos!`, ephemeral: true });
  }

  if (int.isButton() && int.customId === 'cfg_view') {
    const staffText = config.staffRoles.length ? config.staffRoles.map(r => `<@&${r}>`).join(', ') : 'Nenhum';
    const targetChanText = config.targetChannelId ? `<#${config.targetChannelId}>` : 'Não definido';
    const logChanText = config.logChannelId ? `<#${config.logChannelId}>` : 'Não definido';

    return int.reply({ content: `**Configurações Atuais:**\n• **Canal do Painel:** ${targetChanText}\n• **Canal de Logs:** ${logChanText}\n• **Cargos de Staff:** ${staffText}\n• **Status Stream:** ${config.streamText}`, ephemeral: true });
  }

  if (int.isChannelSelectMenu()) {
    if (int.customId === 'cfg_target_chan') config.targetChannelId = int.values[0];
    if (int.customId === 'cfg_log_chan') config.logChannelId = int.values[0];
    salvarCfg();
    return int.reply({ content: `${EMOJIS.zyphor} Canal salvo com sucesso!`, ephemeral: true });
  }

  if (int.isRoleSelectMenu() && int.customId === 'cfg_staff_roles') {
    config.staffRoles = int.values;
    salvarCfg();
    return int.reply({ content: `${EMOJIS.zyphor} Cargos de Staff atualizados!`, ephemeral: true });
  }

  // --- ABRIR TICKET ---
  if (int.isButton() && int.customId === 'abrir_ticket') {
    if (db.userTickets[int.user.id]) {
      return int.reply({ content: `${EMOJIS.proibido} Você já possui um ticket aberto! Feche o anterior para abrir um novo.`, ephemeral: true });
    }

    await int.deferReply({ ephemeral: true });

    const targetChannel = config.targetChannelId ? await client.channels.fetch(config.targetChannelId).catch(() => int.channel) : int.channel;

    const thread = await targetChannel.threads.create({
      name: `🎫-suporte-${int.user.username}`,
      type: ChannelType.PrivateThread,
      invitable: false
    });

    db.userTickets[int.user.id] = thread.id;
    db.tickets[thread.id] = { dono: int.user.id, atendido: false };
    salvarDB();

    await thread.members.add(int.user.id).catch(() => {});

    const embTicket = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`${EMOJIS.suporte} TICKET ABERTO`)
      .setDescription(`${EMOJIS.user} **Autor:** <@${int.user.id}>\n${EMOJIS.avisos} **Status:** 🔴 Não Atendido\n\nAguarde um membro da equipe responder.`)
      .setFooter({ text: "Sistema de Suporte | Zyphor Apps" });

    const btns = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('assumir_ticket').setLabel('Assumir').setStyle(ButtonStyle.Secondary).setEmoji('1541318084210720799'),
      new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Excluir').setStyle(ButtonStyle.Secondary).setEmoji('1541318085435199569')
    );

    const pingStaffs = config.staffRoles.length ? config.staffRoles.map(r => `<@&${r}>`).join(' ') : '';
    await thread.send({ content: `<@${int.user.id}> ${pingStaffs}`, embeds: [embTicket], components: [btns] });
    return int.editReply({ content: `${EMOJIS.zyphor} Seu ticket foi aberto: ${thread}` });
  }

  // --- BOTÕES INTERNOS ---
  if (int.isButton()) {
    const t = db.tickets[int.channel.id];

    if (int.customId === 'assumir_ticket') {
      if (!t) return;
      if (t.atendido) return int.reply({ content: `${EMOJIS.proibido} Este ticket já foi assumido!`, ephemeral: true });

      if (int.user.id === t.dono) {
        return int.reply({ content: `${EMOJIS.proibido} Você não pode assumir o próprio ticket!`, ephemeral: true });
      }

      if (!isStaff(int.member)) {
        return int.reply({ content: `${EMOJIS.proibido} Apenas a equipe de suporte pode assumir tickets!`, ephemeral: true });
      }

      t.atendido = true;
      t.staffId = int.user.id;
      salvarDB();

      await int.channel.members.add(int.user.id).catch(() => {});

      const embUpdate = EmbedBuilder.from(int.message.embeds[0])
        .setDescription(`${EMOJIS.user} **Autor:** <@${t.dono}>\n${EMOJIS.atender} **Status:** 🟢 Atendido por <@${int.user.id}>\n\nAtendimento privado em andamento.`);

      const rowFechar = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Excluir').setStyle(ButtonStyle.Secondary).setEmoji('1541318085435199569')
      );

      await int.message.edit({ embeds: [embUpdate], components: [rowFechar] });
      await int.channel.send({ content: `${EMOJIS.atender} <@${t.dono}>, o atendente <@${int.user.id}> assumiu o seu chamado!` });
      return int.reply({ content: "Você assumiu este atendimento com exclusividade!", ephemeral: true });
    }

    if (int.customId === 'fechar_ticket') {
      if (!t) return;

      if (!isStaff(int.member)) {
        return int.reply({ content: `${EMOJIS.proibido} Apenas membros da equipe de suporte podem excluir o ticket!`, ephemeral: true });
      }

      return encerrarEExcluirTicket(int.channel, int.user.id);
    }
  }
});

client.login(process.env.DISCORD_TOKEN || process.env.TOKEN);
