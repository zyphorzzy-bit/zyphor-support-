const { 
  Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, 
  ButtonStyle, EmbedBuilder, ChannelType, SlashCommandBuilder, REST, Routes, 
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ModalBuilder, TextInputBuilder, 
  TextInputStyle, AttachmentBuilder, MessageType, ActivityType, StringSelectMenuBuilder 
} = require('discord.js');
require('dotenv').config();
const fs = require('fs');

// IDs dos Administradores do Bot
const OWNER_IDS = ['1527769881326522478', '1533306874513068093'];

// Emojis Personalizados
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
  clientChannelId: "", clientEmoji: "🔥",
  staffRoles: [], clientRole1: "", clientRole2: "", streamText: "Zyphor Apps • Atendimento"
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ] 
});

const commands = [
  new SlashCommandBuilder().setName('config').setDescription('Abre o painel interativo de configuração'),
  new SlashCommandBuilder().setName('enviar').setDescription('Envia o painel de tickets no canal')
];

client.on('ready', async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`🤖 Bot Zyphor Suporte Online: ${client.user.tag}`);
    atualizarPresence(client, config.streamText || "Zyphor Apps • Suporte");
  } catch (e) {
    console.error("Erro ao registrar comandos:", e);
  }
});

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

client.on(Events.MessageCreate, async m => {
  if (m.author.bot) return;

  if (config.clientChannelId && m.channel.id === config.clientChannelId) {
    const member = m.member;
    const isCliente1 = config.clientRole1 && member.roles.cache.has(config.clientRole1);
    const isCliente2 = config.clientRole2 && member.roles.cache.has(config.clientRole2);
    const eCliente = isCliente1 || isCliente2 || OWNER_IDS.includes(m.author.id);

    if (!eCliente) {
      await m.delete().catch(() => {});
      return m.channel.send({ content: `${EMOJIS.proibido} <@${m.author.id}>, este canal é exclusivo para clientes com cargo!` }).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });
    }

    if (config.clientEmoji) {
      try {
        await m.react(config.clientEmoji);
      } catch (err) {
        console.error("Erro ao reagir com emoji:", err);
      }
    }
    return;
  }

  if (m.content.toLowerCase().startsWith('z.s')) {
    if (!isStaff(m.member)) {
      return m.reply(`${EMOJIS.proibido} Você não tem permissão para alterar o status da stream!`);
    }

    const novoTexto = m.content.slice(3).trim();
    if (!novoTexto) {
      return m.reply(`${EMOJIS.proibido} Digite o texto desejado! Exemplo: \`z.s Meu Novo Status\``);
    }

    config.streamText = novoTexto;
    salvarCfg();
    atualizarPresence(client, novoTexto);
    return m.reply(`${EMOJIS.zyphor} Status de transmissão atualizado para: **${novoTexto}**`);
  }

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

client.on(Events.InteractionCreate, async int => {
  if (int.isChatInputCommand()) {
    if (int.commandName === 'config') {
      if (!OWNER_IDS.includes(int.user.id)) {
        return int.reply({ content: `${EMOJIS.proibido} Apenas administradores configurados no OWNER_IDS podem usar este comando. Seu ID: \`${int.user.id}\``, ephemeral: true });
      }

      const embedCfg = new EmbedBuilder()
        .setTitle(`${EMOJIS.config} Configuração do Sistema de Tickets`)
        .setDescription("Ajuste os textos, canais e cargos de Staff abaixo:")
        .setColor(0x2b2d31);

      // Linha 1: Botões de Ação
      const rowBtns = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg_texts').setLabel('Editar Textos/Mídias').setStyle(ButtonStyle.Secondary).setEmoji('1534611990633250937'),
        new ButtonBuilder().setCustomId('cfg_emoji').setLabel('Emoji Cliente').setStyle(ButtonStyle.Secondary).setEmoji('1540870215640809482'),
        new ButtonBuilder().setCustomId('cfg_roles_menu').setLabel('Cargos Cliente').setStyle(ButtonStyle.Secondary).setEmoji('1540870215640809482'),
        new ButtonBuilder().setCustomId('cfg_view').setLabel('Ver Configs').setStyle(ButtonStyle.Secondary).setEmoji('1540557352602705990')
      );

      // Linha 2: Canal do Painel
      const rowTarget = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId('cfg_target_chan').setPlaceholder('Selecione o Canal do Painel')
      );

      // Linha 3: Canal de Logs
      const rowLogs = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId('cfg_log_chan').setPlaceholder('Selecione o Canal de Logs')
      );

      // Linha 4: Canal de Clientes
      const rowClientChan = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId('cfg_client_chan').setPlaceholder('Selecione o Canal Exclusivo dos Clientes')
      );

      // Linha 5: Cargos de Staff (Máximo 5 ActionRows permitidos pelo Discord)
      const rowStaff = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId('cfg_staff_roles').setPlaceholder('Cargos de Staff (Até 4)').setMinValues(1).setMaxValues(4)
      );

      return int.reply({ 
        embeds: [embedCfg], 
        components: [rowBtns, rowTarget, rowLogs, rowClientChan, rowStaff], 
        ephemeral: true 
      });
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

  // --- BOTÕES DE CONFIGURAÇÃO ---
  if (int.isButton()) {
    if (int.customId === 'cfg_roles_menu') {
      const rowClient1 = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId('cfg_client_role_1').setPlaceholder('Selecione o Cargo de Cliente 1')
      );
      const rowClient2 = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId('cfg_client_role_2').setPlaceholder('Selecione o Cargo de Cliente 2')
      );
      return int.reply({ content: "Selecione os cargos para os clientes:", components: [rowClient1, rowClient2], ephemeral: true });
    }

    if (int.customId === 'cfg_texts') {
      const modal = new ModalBuilder().setCustomId('modal_cfg_texts').setTitle('Editar Painel de Tickets');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_title').setLabel('Título').setStyle(TextInputStyle.Short).setValue(config.title)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setValue(config.desc)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_img').setLabel('URL Banner').setStyle(TextInputStyle.Short).setValue(config.img || '').setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t_thumb').setLabel('URL Thumbnail').setStyle(TextInputStyle.Short).setValue(config.thumb || '').setRequired(false))
      );
      return int.showModal(modal);
    }

    if (int.customId === 'cfg_emoji') {
      const modal = new ModalBuilder().setCustomId('modal_cfg_emoji').setTitle('Configurar Emoji do Canal de Clientes');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('t_emoji')
            .setLabel('Emoji (Padrão ou Customizado: <:nome:id>)')
            .setStyle(TextInputStyle.Short)
            .setValue(config.clientEmoji || '🔥')
        )
      );
      return int.showModal(modal);
    }

    if (int.customId === 'cfg_view') {
      const staffText = config.staffRoles.length ? config.staffRoles.map(r => `<@&${r}>`).join(', ') : 'Nenhum';
      const client1Text = config.clientRole1 ? `<@&${config.clientRole1}>` : 'Não definido';
      const client2Text = config.clientRole2 ? `<@&${config.clientRole2}>` : 'Não definido';
      const targetChanText = config.targetChannelId ? `<#${config.targetChannelId}>` : 'Não definido';
      const logChanText = config.logChannelId ? `<#${config.logChannelId}>` : 'Não definido';
      const clientChanText = config.clientChannelId ? `<#${config.clientChannelId}>` : 'Não definido';

      return int.reply({ 
        content: `**Configurações Atuais:**\n• **Painel:** ${targetChanText}\n• **Logs:** ${logChanText}\n• **Canal Clientes:** ${clientChanText}\n• **Emoji Cliente:** ${config.clientEmoji || 'Nenhum'}\n• **Staffs:** ${staffText}\n• **Cliente 1:** ${client1Text}\n• **Cliente 2:** ${client2Text}\n• **Stream:** ${config.streamText}`, 
        ephemeral: true 
      });
    }
  }

  // --- SUBMISSÃO DE MODAIS ---
  if (int.isModalSubmit()) {
    if (int.customId === 'modal_cfg_texts') {
      config.title = int.fields.getTextInputValue('t_title');
      config.desc = int.fields.getTextInputValue('t_desc');
      config.img = int.fields.getTextInputValue('t_img');
      config.thumb = int.fields.getTextInputValue('t_thumb');
      salvarCfg();
      return int.reply({ content: `${EMOJIS.zyphor} Salvo com sucesso!`, ephemeral: true });
    }

    if (int.customId === 'modal_cfg_emoji') {
      config.clientEmoji = int.fields.getTextInputValue('t_emoji');
      salvarCfg();
      return int.reply({ content: `${EMOJIS.zyphor} Emoji do canal de clientes atualizado para: ${config.clientEmoji}`, ephemeral: true });
    }
  }

  // --- SELEÇÃO DE MENUS ---
  if (int.isChannelSelectMenu()) {
    if (int.customId === 'cfg_target_chan') config.targetChannelId = int.values[0];
    if (int.customId === 'cfg_log_chan') config.logChannelId = int.values[0];
    if (int.customId === 'cfg_client_chan') config.clientChannelId = int.values[0];
    salvarCfg();
    return int.reply({ content: `${EMOJIS.zyphor} Canal salvo com sucesso!`, ephemeral: true });
  }

  if (int.isRoleSelectMenu()) {
    if (int.customId === 'cfg_staff_roles') config.staffRoles = int.values;
    if (int.customId === 'cfg_client_role_1') config.clientRole1 = int.values[0];
    if (int.customId === 'cfg_client_role_2') config.clientRole2 = int.values[0];
    salvarCfg();
    return int.reply({ content: `${EMOJIS.zyphor} Cargos atualizados!`, ephemeral: true });
  }

  // --- ABRIR TICKET ---
  if (int.isButton() && int.customId === 'abrir_ticket') {
    if (db.userTickets[int.user.id]) {
      return int.reply({ content: `${EMOJIS.proibido} Você já possui um ticket aberto!`, ephemeral: true });
    }

    await int.deferReply({ ephemeral: true });

    const member = int.member;
    const isCliente1 = config.clientRole1 && member.roles.cache.has(config.clientRole1);
    const isCliente2 = config.clientRole2 && member.roles.cache.has(config.clientRole2);
    const isCliente = isCliente1 || isCliente2;

    const targetChannel = config.targetChannelId ? await client.channels.fetch(config.targetChannelId).catch(() => int.channel) : int.channel;

    const threadName = isCliente ? `⭐-cliente-${int.user.username}` : `🎫-suporte-${int.user.username}`;

    const thread = await targetChannel.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      invitable: false
    });

    db.userTickets[int.user.id] = thread.id;
    db.tickets[thread.id] = { dono: int.user.id, atendido: false };
    salvarDB();

    await thread.members.add(int.user.id).catch(() => {});

    const prioridadeText = isCliente 
      ? `\n\n⚡ **ATENDIMENTO PRIORITÁRIO (CLIENTE VIP)**\nO usuário já é um cliente cadastrado! Preste suporte rápido.`
      : '';

    const embTicket = new EmbedBuilder()
      .setColor(isCliente ? 0xf1c40f : 0x2b2d31)
      .setTitle(`${EMOJIS.suporte} TICKET ABERTO`)
      .setDescription(`${EMOJIS.user} **Autor:** <@${int.user.id}>\n${EMOJIS.avisos} **Status:** 🔴 Não Atendido${prioridadeText}`)
      .setFooter({ text: "Sistema de Suporte | Zyphor Apps" });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('assumir_ticket').setLabel('Assumir').setStyle(ButtonStyle.Secondary).setEmoji('1541318084210720799'),
      new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Excluir').setStyle(ButtonStyle.Secondary).setEmoji('1541318085435199569')
    );

    const rowStaff = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setar_cliente_menu').setLabel('Setar Cliente').setStyle(ButtonStyle.Primary).setEmoji('1540870215640809482')
    );

    const pingStaffs = config.staffRoles.length ? config.staffRoles.map(r => `<@&${r}>`).join(' ') : '';
    await thread.send({ 
      content: `${isCliente ? '🔥 **[PRIORIDADE CLIENTE]**' : ''} <@${int.user.id}> ${pingStaffs}`, 
      embeds: [embTicket], 
      components: [row1, rowStaff] 
    });

    return int.editReply({ content: `${EMOJIS.zyphor} Seu ticket foi aberto: ${thread}` });
  }

  // --- AÇÕES DO TICKET ---
  if (int.isButton()) {
    const t = db.tickets[int.channel.id];

    if (int.customId === 'setar_cliente_menu') {
      if (!isStaff(int.member)) {
        return int.reply({ content: `${EMOJIS.proibido} Apenas membros da equipe podem setar cargo de cliente!`, ephemeral: true });
      }

      if (!config.clientRole1 && !config.clientRole2) {
        return int.reply({ content: `${EMOJIS.proibido} Nenhum cargo de cliente foi configurado no \`/config\`!`, ephemeral: true });
      }

      const options = [];
      if (config.clientRole1) {
        options.push({ label: 'Cargo Cliente 1', value: config.clientRole1, description: 'Atribui o primeiro cargo de cliente' });
      }
      if (config.clientRole2) {
        options.push({ label: 'Cargo Cliente 2', value: config.clientRole2, description: 'Atribui o segundo cargo de cliente' });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('aplicar_cargo_cliente')
        .setPlaceholder('Escolha qual cargo de cliente atribuir')
        .addOptions(options);

      const rowSelect = new ActionRowBuilder().addComponents(selectMenu);
      return int.reply({ content: "Selecione abaixo qual cargo de cliente você deseja dar ao usuário:", components: [rowSelect], ephemeral: true });
    }

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

      await int.message.edit({ embeds: [embUpdate] });
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

  if (int.isStringSelectMenu() && int.customId === 'aplicar_cargo_cliente') {
    const t = db.tickets[int.channel.id];
    if (!t) return int.reply({ content: `${EMOJIS.proibido} Ticket não encontrado no banco de dados!`, ephemeral: true });

    const selectedRoleId = int.values[0];

    try {
      const clienteMember = await int.guild.members.fetch(t.dono);

      if (clienteMember.roles.cache.has(selectedRoleId)) {
        return int.reply({ content: `${EMOJIS.avisos} Este usuário já possui este cargo de cliente!`, ephemeral: true });
      }

      await clienteMember.roles.add(selectedRoleId);
      await int.channel.send({ content: `${EMOJIS.zyphor} O staff <@${int.user.id}> concedeu o cargo <@&${selectedRoleId}> para <@${t.dono}>!` });
      return int.reply({ content: "Cargo concedido com sucesso!", ephemeral: true });
    } catch (err) {
      console.error(err);
      return int.reply({ content: `${EMOJIS.proibido} Erro ao conceder cargo! Certifique-se de que o cargo do bot está acima dos cargos de cliente.`, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN || process.env.TOKEN);
