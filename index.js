const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits, 
    ChannelType, 
    AuditLogEvent,
    WebhookClient,
    SlashCommandBuilder,
    REST,
    Routes
} = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

// IDs de canales fijos
const LOG_CHANNEL_ID = '1560757735866507274';
const WELCOME_CHANNEL_ID = '1560719843504685067';
const LEAVE_CHANNEL_ID = '1560719911301554266';
const BOOST_CHANNEL_ID = '1560720028243075092';

// Imágenes configuradas
const WELCOME_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1560711090965323806/1560783372991733791/7371368a0c73866feb45597556de6309.jpg?ex=6ad3f84a&is=6ad2a6ca&hm=331c30444fc1a423a833c428db8e9fee90ea8fdec95a4da48219c2020aa8f3ab&';
const LEAVE_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1560711090965323806/1560785955261251625/bd4af2575ed18c31782687eff1383565.jpg?ex=6ad3fab1&is=6ad2a931&hm=5d53b6899e155311c5eef229786bd52b08bfc6474661ef47df81c30a2f3118d6&';

// Webhook opcional
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const webhookClient = WEBHOOK_URL ? new WebhookClient({ url: WEBHOOK_URL }) : null;

// Función global de envío de logs
async function sendLog(guild, embed) {
    if (guild) {
        const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) {
            logChannel.send({ embeds: [embed] }).catch(() => {});
        }
    }

    if (webhookClient) {
        webhookClient.send({ embeds: [embed] }).catch(() => {});
    }
}

// Auxiliar para parsear tiempo de mute
function parseTime(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

// Auxiliar para formatear segundos a texto legible
function formatDuration(seconds) {
    if (!seconds || seconds === 0) return 'Nunca (Infinita)';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    let result = [];
    if (days > 0) result.push(`${days}d`);
    if (hours > 0) result.push(`${hours}h`);
    if (minutes > 0) result.push(`${minutes}m`);
    if (secs > 0) result.push(`${secs}s`);
    return result.join(' ');
}

// Búsqueda flexible de miembros
async function findMember(guild, query) {
    if (!query) return null;
    const cleanId = query.replace(/[<@!>]/g, '');
    
    if (/^\d{17,19}$/.test(cleanId)) {
        try {
            return await guild.members.fetch(cleanId);
        } catch (e) {
            return null;
        }
    }

    const members = await guild.members.fetch();
    const queryLower = query.toLowerCase();

    return members.find(m => 
        m.user.username.toLowerCase().includes(queryLower) || 
        (m.nickname && m.nickname.toLowerCase().includes(queryLower)) ||
        m.user.tag.toLowerCase() === queryLower
    ) || null;
}

// Generador de tamaño de banana
function getRandomBananaSize() {
    const min = 1;
    const max = 32;
    const randomWeighted = Math.pow(Math.random(), 2.5); 
    return Math.floor(randomWeighted * (max - min + 1)) + min;
}

// Definición de Comandos de Slash
const slashCommands = [
    new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Crea y envía un embed personalizado en el canal')
        .addStringOption(option => 
            option.setName('descripcion')
                .setDescription('Descripción principal dentro del embed')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('titulo')
                .setDescription('Título del embed')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('color')
                .setDescription('Color en formato HEX (ejemplo: #ff0000 o #3498db)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('texto_fuera')
                .setDescription('Texto que irá fuera del embed (menciones, avisos, etc.)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('imagen_url')
                .setDescription('URL de una imagen para la parte inferior del embed')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('footer')
                .setDescription('Texto al pie del embed')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Banea a un usuario del servidor')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('El usuario que deseas banear')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('razon')
                .setDescription('Motivo de la sanción')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Silencia temporalmente a un usuario')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('El usuario a silenciar')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('tiempo')
                .setDescription('Duración del mute (ejemplo: 1s, 5m, 2h, 1d)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('razon')
                .setDescription('Motivo del mute')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulsa a un usuario del servidor')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('El usuario que deseas expulsar')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('razon')
                .setDescription('Motivo de la expulsión')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Elimina mensajes en masa')
        .addIntegerOption(option => 
            option.setName('cantidad')
                .setDescription('Número de mensajes a borrar (1 a 100)')
                .setRequired(true))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`Conectado como ${client.user.tag}`);

    // Registro rápido de Slash Commands en todos los servidores conectados
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: slashCommands }
        );

        client.guilds.cache.forEach(async (guild) => {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guild.id),
                { body: slashCommands }
            ).catch(() => {});
        });

        console.log('Comandos Slash registrados exitosamente.');
    } catch (error) {
        console.error('Error al registrar Slash Commands:', error);
    }
});

// Registrar comandos Slash automáticamente en servidores nuevos
client.on('guildCreate', async (guild) => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, guild.id),
            { body: slashCommands }
        );
    } catch (err) {}
});

// ================= LOGS DE VOZ =================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    if (!oldState.channelId && newState.channelId) {
        const embed = new EmbedBuilder()
            .setTitle('🔊 Voz: Usuario conectado')
            .setColor('#2ecc71')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 Usuario', value: `${member.user.tag} (\`${member.id}\`)`, inline: false },
                { name: '🎙️ Canal', value: `<#${newState.channelId}>`, inline: false }
            )
            .setTimestamp();
        await sendLog(guild, embed);
    } 
    else if (oldState.channelId && !newState.channelId) {
        const embed = new EmbedBuilder()
            .setTitle('FF Voz: Usuario desconectado')
            .setColor('#e74c3c')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 Usuario', value: `${member.user.tag} (\`${member.id}\`)`, inline: false },
                { name: '🎙️ Canal anterior', value: `<#${oldState.channelId}>`, inline: false }
            )
            .setTimestamp();
        await sendLog(guild, embed);
    } 
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const embed = new EmbedBuilder()
            .setTitle('🔄 Voz: Cambio de canal')
            .setColor('#3498db')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 Usuario', value: `${member.user.tag} (\`${member.id}\`)`, inline: false },
                { name: '⬅️ De', value: `<#${oldState.channelId}>`, inline: true },
                { name: '➡️ A', value: `<#${newState.channelId}>`, inline: true }
            )
            .setTimestamp();
        await sendLog(guild, embed);
    }
});

// ================= LOGS DE INVITACIONES CREADAS =================
client.on('inviteCreate', async (invite) => {
    const embed = new EmbedBuilder()
        .setTitle('📩 Invitación creada')
        .setColor('#9b59b6')
        .addFields(
            { name: '👤 Creador', value: invite.inviter ? `${invite.inviter.tag} (\`${invite.inviter.id}\`)` : 'Desconocido', inline: false },
            { name: '🔗 Código', value: `\`${invite.code}\``, inline: true },
            { name: '📌 Canal', value: `<#${invite.channel.id}>`, inline: true },
            { name: '⏳ Expiración', value: formatDuration(invite.maxAge), inline: true },
            { name: '📅 Creada el', value: `<t:${Math.floor(invite.createdTimestamp / 1000)}:F>`, inline: false }
        )
        .setTimestamp();

    await sendLog(invite.guild, embed);
});

// ================= ENTRADAS, SALIDAS Y BOOSTS =================
client.on('guildMemberAdd', async (member) => {
    // Log de entrada
    const logEmbed = new EmbedBuilder()
        .setTitle('📥 Usuario unido')
        .setColor('#2ecc71')
        .setDescription(`**${member.user.tag}** (\`${member.id}\`) se ha unido al servidor.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields({ name: '🆔 ID', value: `\`${member.id}\``, inline: true })
        .setTimestamp();

    await sendLog(member.guild, logEmbed);

    // Mensaje automático de bienvenida
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('👋 ¡Bienvenido a la comunidad!')
            .setColor('#f1c40f')
            .setDescription(`¡Hola ${member} (**${member.user.tag}**)! Nos alegra mucho tenerte por aquí.\n\nEcha un vistazo a los canales principales, respeta las reglas de la comunidad y siéntete libre de charlar con todos. ¡Esperamos que la pases genial y disfrutes tu estancia con nosotros!`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setImage(WELCOME_IMAGE_URL)
            .setFooter({ text: `Usuario: ${member.user.tag}` })
            .setTimestamp();

        welcomeChannel.send({ content: `¡Bienvenido ${member} (**${member.user.tag}**)!`, embeds: [welcomeEmbed] }).catch(() => {});
    }
});

client.on('guildMemberRemove', async (member) => {
    // Log de salida
    const logEmbed = new EmbedBuilder()
        .setTitle('📤 Usuario salido')
        .setColor('#e74c3c')
        .setDescription(`**${member.user.tag}** (\`${member.id}\`) ha salido del servidor.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields({ name: '🆔 ID', value: `\`${member.id}\``, inline: true })
        .setTimestamp();

    await sendLog(member.guild, logEmbed);

    // Mensaje automático de despedida
    const leaveChannel = member.guild.channels.cache.get(LEAVE_CHANNEL_ID);
    if (leaveChannel) {
        const leaveEmbed = new EmbedBuilder()
            .setTitle('👋 ¡Hasta pronto!')
            .setColor('#e74c3c')
            .setDescription(`**${member.user.tag}** (${member}) ha decidido dejar el servidor.\n\nLe agradecemos por el tiempo que compartió con nosotros en la comunidad. Le deseamos muchísimo éxito en todos sus proyectos futuros y esperamos que le vaya excelente en su camino. ¡Las puertas siempre estarán abiertas si decide volver!`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setImage(LEAVE_IMAGE_URL)
            .setFooter({ text: `Usuario: ${member.user.tag}` })
            .setTimestamp();

        leaveChannel.send({ content: `Un usuario nos ha dejado: **${member.user.tag}** (${member})`, embeds: [leaveEmbed] }).catch(() => {});
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const logEmbed = new EmbedBuilder()
            .setTitle('🚀 Nuevo Boost')
            .setColor('#9b59b6')
            .setDescription(`**${newMember.user.tag}** (${newMember}) ha potenciado el servidor. ¡Gracias por tu apoyo!`)
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        await sendLog(newMember.guild, logEmbed);

        const boostChannel = newMember.guild.channels.cache.get(BOOST_CHANNEL_ID);
        if (boostChannel) {
            const boostEmbed = new EmbedBuilder()
                .setTitle('🚀 ¡Un nuevo Boost ha llegado!')
                .setColor('#9b59b6')
                .setDescription(`¡Muchísimas gracias a **${newMember.user.tag}** (${newMember}) por potenciar el servidor!\n\nTu apoyo ayuda enormemente a mejorar la calidad de la comunidad y desbloquear ventajas exclusivas para todos. ¡Disfruta de tus beneficios y gracias por formar parte de esto!`)
                .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Booster: ${newMember.user.tag}` })
                .setTimestamp();

            boostChannel.send({ content: `¡Gracias por el boost ${newMember} (**${newMember.user.tag}**)! 🚀`, embeds: [boostEmbed] }).catch(() => {});
        }
    }
});

// ================= LOG DE MENSAJES BORRADOS =================
client.on('messageDelete', async (message) => {
    if (message.partial || !message.guild || message.author?.bot) return;

    let deletedBy = 'Desconocido / Propio usuario';
    try {
        const fetchedLogs = await message.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MessageDelete,
        });
        const deletionLog = fetchedLogs.entries.first();
        if (deletionLog && deletionLog.target.id === message.author.id && (Date.now() - deletionLog.createdTimestamp < 5000)) {
            deletedBy = deletionLog.executor.tag;
        }
    } catch (err) {}

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Mensaje borrado')
        .setColor('#e67e22')
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '👤 Usuario', value: `${message.author.tag} (\`${message.author.id}\`)`, inline: false },
            { name: '📌 Canal', value: `<#${message.channel.id}>`, inline: false },
            { name: '💬 Contenido', value: message.content || '[Sin texto / Solo contenido multimedia]', inline: false },
            { name: '🛠️ Borrado por', value: deletedBy, inline: false }
        )
        .setTimestamp();

    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        embed.setImage(attachment.url);
        embed.addFields({ name: '🖼️ Adjunto', value: 'El mensaje contenía una foto o archivo.', inline: false });
    }

    await sendLog(message.guild, embed);
});

// ================= COMANDOS POR MENSAJE DE TEXTO =================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Comando .ping
    if (command === '.ping') {
        const msg = await message.channel.send('🏓 Calculando latencia...');
        const latency = msg.createdTimestamp - message.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);
        return msg.edit(`🏓 Pong! Latencia del bot: **${latency}ms** | API: **${apiLatency}ms**`);
    }

    // Comandos de prueba con punto
    if (command === '.bienvenida') {
        const embed = new EmbedBuilder()
            .setTitle('👋 ¡Bienvenido a la comunidad!')
            .setColor('#f1c40f')
            .setDescription(`¡Hola ${message.author} (**${message.author.tag}**)! Nos alegra mucho tenerte por aquí.\n\nEcha un vistazo a los canales principales, respeta las reglas de la comunidad y siéntete libre de charlar con todos. ¡Esperamos que la pases genial y disfrutes tu estancia con nosotros!`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setImage(WELCOME_IMAGE_URL)
            .setFooter({ text: `Usuario: ${message.author.tag}` })
            .setTimestamp();
        return message.channel.send({ content: `¡Bienvenido ${message.author} (**${message.author.tag}**)!`, embeds: [embed] });
    }

    if (command === '.despedida') {
        const embed = new EmbedBuilder()
            .setTitle('👋 ¡Hasta pronto!')
            .setColor('#e74c3c')
            .setDescription(`**${message.author.tag}** (${message.author}) ha decidido dejar el servidor.\n\nLe agradecemos por el tiempo que compartió con nosotros en la comunidad. Le deseamos muchísimo éxito en todos sus proyectos futuros y esperamos que le vaya excelente en su camino. ¡Las puertas siempre estarán abiertas si decide volver!`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setImage(LEAVE_IMAGE_URL)
            .setFooter({ text: `Usuario: ${message.author.tag}` })
            .setTimestamp();
        return message.channel.send({ content: `Un usuario nos ha dejado: **${message.author.tag}** (${message.author})`, embeds: [embed] });
    }

    if (command === '.boost') {
        const embed = new EmbedBuilder()
            .setTitle('🚀 ¡Un nuevo Boost ha llegado!')
            .setColor('#9b59b6')
            .setDescription(`¡Muchísimas gracias a **${message.author.tag}** (${message.author}) por potenciar el servidor!\n\nTu apoyo ayuda enormemente a mejorar la calidad de la comunidad y desbloquear ventajas exclusivas para todos. ¡Disfruta de tus beneficios y gracias por formar parte de esto!`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `Booster: ${message.author.tag}` })
            .setTimestamp();
        return message.channel.send({ content: `¡Gracias por el boost ${message.author} (**${message.author.tag}**)! 🚀`, embeds: [embed] });
    }

    // Setup de tickets
    if (command === '!ticket-setup') {
        const isOwner = message.author.id === message.guild.ownerId;
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isOwner && !isAdmin) {
            return message.reply('porque intentas usar comandos de administracion bro, te voy a tocar');
        }

        const embed = new EmbedBuilder()
            .setTitle('📩 Soporte de Tickets')
            .setColor('#34495e')
            .setDescription('Haz clic en el botón de abajo para abrir un ticket de soporte privado.');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_ticket')
                .setLabel('Crear Ticket')
                .setEmoji('📩')
                .setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        return message.delete().catch(() => {});
    }

    // Comandos "kaponi ..."
    if (command === 'kaponi') {
        const subCommand = args.shift()?.toLowerCase();

        // Comando kaponi purge
        if (subCommand === 'purge') {
            const isOwner = message.author.id === message.guild.ownerId;
            const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
            const hasManageMsgs = message.member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isOwner && !isAdmin && !hasManageMsgs) {
                return message.reply('porque intentas usar comandos de administracion bro, te voy a tocar');
            }

            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount < 1 || amount > 100) {
                return message.reply('⚠️ Especifica un número válido entre **1 y 100** para borrar.');
            }

            try {
                await message.delete().catch(() => {});
                const deleted = await message.channel.bulkDelete(amount, true);

                const confirmMsg = await message.channel.send(`🧹 Se han borrado **${deleted.size}** mensajes correctamente.`);
                setTimeout(() => confirmMsg.delete().catch(() => {}), 4000);

                const logEmbed = new EmbedBuilder()
                    .setTitle('🧹 Purga de Mensajes')
                    .setColor('#e67e22')
                    .addFields(
                        { name: '📌 Canal', value: `<#${message.channel.id}>`, inline: true },
                        { name: '🔢 Cantidad', value: `${deleted.size} mensajes`, inline: true },
                        { name: '🛡️ Moderador', value: message.author.tag, inline: false }
                    )
                    .setTimestamp();
                await sendLog(message.guild, logEmbed);
                return;
            } catch (err) {
                return message.reply(`❌ No se pudieron borrar los mensajes: ${err.message || 'Los mensajes de más de 14 días no se pueden borrar en masa.'}`);
            }
        }

        // Comando kaponi helpadmin
        if (subCommand === 'helpadmin') {
            const isOwner = message.author.id === message.guild.ownerId;
            const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isOwner && !isAdmin) {
                return message.reply('porque intentas usar comandos de administracion bro, te voy a tocar');
            }

            const helpEmbed = new EmbedBuilder()
                .setTitle('⚙️ Panel de Comandos - LikeKaponi Bot')
                .setColor('#2c3e50')
                .setDescription('Lista completa de comandos disponibles en el bot:')
                .addFields(
                    { 
                        name: '🛡️ Moderación / Administración (Comandos y Slash)', 
                        value: '`/ban` o `kaponi ban [usuario] [razón]` - Banea a un usuario\n`/mute` o `kaponi mute [usuario] [tiempo] [razón]` - Silencia temporalmente (ej. 1s, 5m, 2h, 1d)\n`/kick` o `kaponi kick [usuario] [razón]` - Expulsa a un usuario\n`/purge` o `kaponi purge [1-100]` - Borra masivamente hasta 100 mensajes\n`!ticket-setup` - Despliega el panel para abrir tickets\n`/embed` - Comando de Slash para crear embeds personalizados' 
                    },
                    { 
                        name: '🍌 Entretenimiento', 
                        value: '`kaponi banana [@usuario]` - Mide el tamaño de la banana (1cm a 32cm)' 
                    },
                    { 
                        name: '📊 Utilidad y Latencia', 
                        value: '`kaponi ping` - Consulta la latencia del bot y la API\n`.ping` - Consulta la latencia rápida' 
                    },
                    { 
                        name: '🧪 Pruebas', 
                        value: '`.bienvenida` - Muestra un ejemplo de bienvenida\n`.despedida` - Muestra un ejemplo de salida\n`.boost` - Muestra un ejemplo de boost' 
                    }
                )
                .setFooter({ text: 'LikeKaponi Bot • Sistema de Administración' })
                .setTimestamp();

            return message.channel.send({ embeds: [helpEmbed] });
        }

        // Comando kaponi ping
        if (subCommand === 'ping') {
            const msg = await message.channel.send('🏓 Calculando latencia...');
            const latency = msg.createdTimestamp - message.createdTimestamp;
            const apiLatency = Math.round(client.ws.ping);
            return msg.edit(`🏓 Pong! Latencia del bot: **${latency}ms** | API: **${apiLatency}ms**`);
        }

        // Comando kaponi banana
        if (subCommand === 'banana') {
            const targetUser = message.mentions.users.first() || message.author;
            const size = getRandomBananaSize();

            const embed = new EmbedBuilder()
                .setTitle('🍌 Tamaño de Banana')
                .setColor('#f1c40f')
                .setDescription(`La banana de ${targetUser} (**${targetUser.tag}**) mide **${size}cm** 🍌`)
                .setImage('https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&auto=format&fit=crop&q=60');

            return message.channel.send({ embeds: [embed] });
        }

        if (!subCommand || !['ban', 'mute', 'kick'].includes(subCommand)) {
            return;
        }

        // Comprobación de permisos absoluta
        const isOwner = message.author.id === message.guild.ownerId;
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
        const requiredPermission = 
            subCommand === 'ban' ? PermissionFlagsBits.BanMembers :
            subCommand === 'kick' ? PermissionFlagsBits.KickMembers : PermissionFlagsBits.ModerateMembers;

        if (!isOwner && !isAdmin && !message.member.permissions.has(requiredPermission)) {
            return message.reply('porque intentas usar comandos de administracion bro, te voy a tocar');
        }

        const targetQuery = args[0];
        if (!targetQuery) {
            return message.reply('⚠️ Debes especificar el usuario (mención, ID o nombre).');
        }

        const targetMember = await findMember(message.guild, targetQuery);
        
        // --- BAN ---
        if (subCommand === 'ban') {
            const cleanId = targetQuery.replace(/[<@!>]/g, '');
            const reason = args.slice(1).join(' ') || 'Sin razón especificada';

            if (targetMember) {
                if (targetMember.id === message.guild.ownerId) {
                    return message.reply('❌ No se puede banear a este usuario: Es el dueño del servidor.');
                }
                if (!isOwner && !isAdmin && targetMember.roles.highest.position >= message.member.roles.highest.position) {
                    return message.reply('❌ No se pudo banear al usuario: Su rol es igual o superior al tuyo en la jerarquía.');
                }
                if (!targetMember.bannable) {
                    return message.reply('❌ No se pudo banear al usuario: El rol más alto del bot está por debajo del rol del usuario que intentas banear.');
                }
            }

            try {
                await message.guild.members.ban(targetMember ? targetMember.id : cleanId, { reason });
                const tagUser = targetMember ? targetMember.user.tag : cleanId;
                message.channel.send(`🔨 Usuario **${tagUser}** baneado correctamente.`);

                const logEmbed = new EmbedBuilder()
                    .setTitle('🔨 Sanción: Ban')
                    .setColor('#c0392b')
                    .addFields(
                        { name: '👤 Usuario', value: `${tagUser} (\`${cleanId}\`)`, inline: true },
                        { name: '🛡️ Moderador', value: message.author.tag, inline: true },
                        { name: '📄 Razón', value: reason, inline: false }
                    )
                    .setTimestamp();
                await sendLog(message.guild, logEmbed);
            } catch (err) {
                message.reply(`❌ Error al intentar banear: ${err.message || 'Verifica que la ID sea válida o que el bot tenga permisos.'}`);
            }
        }

        // --- MUTE ---
        else if (subCommand === 'mute') {
            if (!targetMember) {
                return message.reply('⚠️ No se encontró al usuario en el servidor. Para aplicar mute, el usuario debe estar presente.');
            }

            const timeArg = args[1];
            const duration = parseTime(timeArg);
            const reason = args.slice(2).join(' ') || 'Sin razón especificada';

            if (!duration) {
                return message.reply('⚠️ Formato de tiempo inválido. Usa por ejemplo: `1s`, `5m`, `2h` o `1d`. Ejemplo: `kaponi mute @pepe 10m Spam`');
            }

            if (targetMember.id === message.guild.ownerId) {
                return message.reply('❌ No se puede silenciar a este usuario: Es el dueño del servidor.');
            }
            if (!isOwner && !isAdmin && targetMember.roles.highest.position >= message.member.roles.highest.position) {
                return message.reply('❌ No se pudo silenciar al usuario: Posee un rol igual o superior al tuyo.');
            }
            if (!targetMember.moderatable) {
                return message.reply('❌ No se pudo silenciar al usuario: El rol del bot está por debajo del rol de este usuario.');
            }

            try {
                await targetMember.timeout(duration, reason);
                message.channel.send(`🤐 Usuario **${targetMember.user.tag}** silenciado por ${timeArg}.`);

                const logEmbed = new EmbedBuilder()
                    .setTitle('🤐 Sanción: Mute / Timeout')
                    .setColor('#d35400')
                    .addFields(
                        { name: '👤 Usuario', value: `${targetMember.user.tag} (\`${targetMember.id}\`)`, inline: true },
                        { name: '🛡️ Moderador', value: message.author.tag, inline: true },
                        { name: '⏳ Duración', value: timeArg, inline: true },
                        { name: '📄 Razón', value: reason, inline: false }
                    )
                    .setTimestamp();
                await sendLog(message.guild, logEmbed);
            } catch (err) {
                message.reply(`❌ Error al silenciar al usuario: ${err.message}`);
            }
        }

        // --- KICK ---
        else if (subCommand === 'kick') {
            if (!targetMember) {
                return message.reply('⚠️ No se encontró al usuario en el servidor.');
            }

            const reason = args.slice(1).join(' ') || 'Sin razón especificada';

            if (targetMember.id === message.guild.ownerId) {
                return message.reply('❌ No se puede expulsar a este usuario: Es el dueño del servidor.');
            }
            if (!isOwner && !isAdmin && targetMember.roles.highest.position >= message.member.roles.highest.position) {
                return message.reply('❌ No se pudo expulsar al usuario: Su rol es igual o superior al tuyo.');
            }
            if (!targetMember.kickable) {
                return message.reply('❌ No se pudo expulsar al usuario: El rol del bot está por debajo del rol de este usuario.');
            }

            try {
                await targetMember.kick(reason);
                message.channel.send(`👢 Usuario **${targetMember.user.tag}** expulsado correctamente.`);

                const logEmbed = new EmbedBuilder()
                    .setTitle('👢 Sanción: Kick')
                    .setColor('#e67e22')
                    .addFields(
                        { name: '👤 Usuario', value: `${targetMember.user.tag} (\`${targetMember.id}\`)`, inline: true },
                        { name: '🛡️ Moderador', value: message.author.tag, inline: true },
                        { name: '📄 Razón', value: reason, inline: false }
                    )
                    .setTimestamp();
                await sendLog(message.guild, logEmbed);
            } catch (err) {
                message.reply(`❌ Error al expulsar al usuario: ${err.message}`);
            }
        }
    }
});

// ================= INTERACCIONES (SLASH COMMANDS Y TICKETS) =================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const isOwner = interaction.user.id === interaction.guild.ownerId;
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        // /EMBED
        if (interaction.commandName === 'embed') {
            const hasManageMsgs = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
            if (!isOwner && !isAdmin && !hasManageMsgs) {
                return interaction.reply({ content: 'porque intentas usar comandos de administracion bro, te voy a tocar', ephemeral: true });
            }

            const descripcion = interaction.options.getString('descripcion');
            const titulo = interaction.options.getString('titulo');
            const color = interaction.options.getString('color') || '#2b2d31';
            const textoFuera = interaction.options.getString('texto_fuera');
            const imagenUrl = interaction.options.getString('imagen_url');
            const footer = interaction.options.getString('footer');

            const embed = new EmbedBuilder().setDescription(descripcion);

            if (titulo) embed.setTitle(titulo);
            if (/^#([0-9A-F]{3}){1,2}$/i.test(color)) {
                embed.setColor(color);
            } else {
                embed.setColor('#2b2d31');
            }

            if (imagenUrl) embed.setImage(imagenUrl);
            if (footer) embed.setFooter({ text: footer });

            const payload = { embeds: [embed] };
            if (textoFuera) payload.content = textoFuera;

            await interaction.channel.send(payload);
            return interaction.reply({ content: '✅ Embed enviado correctamente.', ephemeral: true });
        }

        // /BAN
        if (interaction.commandName === 'ban') {
            const hasBanPerm = interaction.member.permissions.has(PermissionFlagsBits.BanMembers);
            if (!isOwner && !isAdmin && !hasBanPerm) {
                return interaction.reply({ content: 'porque intentas usar comandos de administracion bro, te voy a tocar', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('usuario');
            const reason = interaction.options.getString('razon') || 'Sin razón especificada';
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (targetMember) {
                if (targetMember.id === interaction.guild.ownerId) {
                    return interaction.reply({ content: '❌ No se puede banear al dueño del servidor.', ephemeral: true });
                }
                if (!isOwner && !isAdmin && targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
                    return interaction.reply({ content: '❌ Su rol es igual o superior al tuyo en la jerarquía.', ephemeral: true });
                }
                if (!targetMember.bannable) {
                    return interaction.reply({ content: '❌ El rol del bot está por debajo del rol del usuario.', ephemeral: true });
                }
            }

            try {
                await interaction.guild.members.ban(targetUser.id, { reason });
                await interaction.reply({ content: `🔨 Usuario **${targetUser.tag}** baneado correctamente.` });

                const logEmbed = new EmbedBuilder()
                    .setTitle('🔨 Sanción: Ban (Slash)')
                    .setColor('#c0392b')
                    .addFields(
                        { name: '👤 Usuario', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
                        { name: '🛡️ Moderador', value: interaction.user.tag, inline: true },
                        { name: '📄 Razón', value: reason, inline: false }
                    )
                    .setTimestamp();
                await sendLog(interaction.guild, logEmbed);
            } catch (err) {
                await interaction.reply({ content: `❌ Error al banear: ${err.message}`, ephemeral: true });
            }
        }

        // /MUTE
        if (interaction.commandName === 'mute') {
            const hasModPerm = interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers);
            if (!isOwner && !isAdmin && !hasModPerm) {
                return interaction.reply({ content: 'porque intentas usar comandos de administracion bro, te voy a tocar', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('usuario');
            const timeArg = interaction.options.getString('tiempo');
            const duration = parseTime(timeArg);
            const reason = interaction.options.getString('razon') || 'Sin razón especificada';

            if (!duration) {
                return interaction.reply({ content: '⚠️ Formato de tiempo inválido (ej. `1s`, `5m`, `2h`, `1d`).', ephemeral: true });
            }

            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) {
                return interaction.reply({ content: '⚠️ El usuario debe estar en el servidor para silenciarlo.', ephemeral: true });
            }

            if (targetMember.id === interaction.guild.ownerId) {
                return interaction.reply({ content: '❌ No se puede silenciar al dueño del servidor.', ephemeral: true });
            }
            if (!isOwner && !isAdmin && targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
                return interaction.reply({ content: '❌ Posee un rol igual o superior al tuyo.', ephemeral: true });
            }
            if (!targetMember.moderatable) {
                return interaction.reply({ content: '❌ El rol del bot está por debajo del rol de este usuario.', ephemeral: true });
            }

            try {
                await targetMember.timeout(duration, reason);
                await interaction.reply({ content: `🤐 Usuario **${targetUser.tag}** silenciado por ${timeArg}.` });

                const logEmbed = new EmbedBuilder()
                    .setTitle('🤐 Sanción: Mute (Slash)')
                    .setColor('#d35400')
                    .addFields(
                        { name: '👤 Usuario', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
                        { name: '🛡️ Moderador', value: interaction.user.tag, inline: true },
                        { name: '⏳ Duración', value: timeArg, inline: true },
                        { name: '📄 Razón', value: reason, inline: false }
                    )
                    .setTimestamp();
                await sendLog(interaction.guild, logEmbed);
            } catch (err) {
                await interaction.reply({ content: `❌ Error al silenciar: ${err.message}`, ephemeral: true });
            }
        }

        // /KICK
        if (interaction.commandName === 'kick') {
            const hasKickPerm = interaction.member.permissions.has(PermissionFlagsBits.KickMembers);
            if (!isOwner && !isAdmin && !hasKickPerm) {
                return interaction.reply({ content: 'porque intentas usar comandos de administracion bro, te voy a tocar', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('usuario');
            const reason = interaction.options.getString('razon') || 'Sin razón especificada';
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!targetMember) {
                return interaction.reply({ content: '⚠️ No se encontró al usuario en el servidor.', ephemeral: true });
            }

            if (targetMember.id === interaction.guild.ownerId) {
                return interaction.reply({ content: '❌ No se puede expulsar al dueño del servidor.', ephemeral: true });
            }
            if (!isOwner && !isAdmin && targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
                return interaction.reply({ content: '❌ Su rol es igual o superior al tuyo en la jerarquía.', ephemeral: true });
            }
            if (!targetMember.kickable) {
                return interaction.reply({ content: '❌ El rol del bot está por debajo del rol de este usuario.', ephemeral: true });
            }

            try {
                await targetMember.kick(reason);
                await interaction.reply({ content: `👢 Usuario **${targetUser.tag}** expulsado correctamente.` });

                const logEmbed = new EmbedBuilder()
                    .setTitle('👢 Sanción: Kick (Slash)')
                    .setColor('#e67e22')
                    .addFields(
                        { name: '👤 Usuario', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
                        { name: '🛡️ Moderador', value: interaction.user.tag, inline: true },
                        { name: '📄 Razón', value: reason, inline: false }
                    )
                    .setTimestamp();
                await sendLog(interaction.guild, logEmbed);
            } catch (err) {
                await interaction.reply({ content: `❌ Error al expulsar: ${err.message}`, ephemeral: true });
            }
        }

        // /PURGE
        if (interaction.commandName === 'purge') {
            const hasManageMsgs = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
            if (!isOwner && !isAdmin && !hasManageMsgs) {
                return interaction.reply({ content: 'porque intentas usar comandos de administracion bro, te voy a tocar', ephemeral: true });
            }

            const amount = interaction.options.getInteger('cantidad');
            if (amount < 1 || amount > 100) {
                return interaction.reply({ content: '⚠️ Especifica un número válido entre 1 y 100.', ephemeral: true });
            }

            try {
                const deleted = await interaction.channel.bulkDelete(amount, true);
                await interaction.reply({ content: `🧹 Se han borrado **${deleted.size}** mensajes correctamente.`, ephemeral: true });

                const logEmbed = new EmbedBuilder()
                    .setTitle('🧹 Purga de Mensajes (Slash)')
                    .setColor('#e67e22')
                    .addFields(
                        { name: '📌 Canal', value: `<#${interaction.channel.id}>`, inline: true },
                        { name: '🔢 Cantidad', value: `${deleted.size} mensajes`, inline: true },
                        { name: '🛡️ Moderador', value: interaction.user.tag, inline: false }
                    )
                    .setTimestamp();
                await sendLog(interaction.guild, logEmbed);
            } catch (err) {
                await interaction.reply({ content: `❌ No se pudieron borrar los mensajes: ${err.message}`, ephemeral: true });
            }
        }
    }

    // Interacciones de Botones de Tickets
    if (interaction.isButton()) {
        if (interaction.customId === 'open_ticket') {
            const guild = interaction.guild;
            const member = interaction.member;

            try {
                const channel = await guild.channels.create({
                    name: `ticket-${member.user.username}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            denied: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: member.id,
                            allowed: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                        },
                    ],
                });

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Cerrar Ticket')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger)
                );

                const ticketEmbed = new EmbedBuilder()
                    .setTitle(`📩 Ticket de ${member.user.tag}`)
                    .setColor('#2ecc71')
                    .setDescription('Describe tu consulta o problema. Un miembro del equipo te atenderá pronto.');

                await channel.send({ content: `${member}`, embeds: [ticketEmbed], components: [closeRow] });
                await interaction.reply({ content: `✅ Ticket creado: <#${channel.id}>`, ephemeral: true });
            } catch (err) {
                await interaction.reply({ content: '❌ Hubo un error al crear el ticket.', ephemeral: true });
            }
        }

        if (interaction.customId === 'close_ticket') {
            const channel = interaction.channel;
            await interaction.reply({ content: '🔒 Cerrando ticket en 5 segundos...' });
            setTimeout(() => {
                channel.delete().catch(() => {});
            }, 5000);
        }
    }
});

client.login(process.env.TOKEN);
