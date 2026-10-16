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
    WebhookClient 
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

// ID del canal de logs
const LOG_CHANNEL_ID = '1560757735866507274';

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

// Búsqueda flexible de miembros (por mención, ID o nombre/apodo)
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

// Generador de tamaño de banana con probabilidad ponderada (mínimo 1, máximo 32)
function getRandomBananaSize() {
    const min = 1;
    const max = 32;
    const randomWeighted = Math.pow(Math.random(), 2.5); 
    return Math.floor(randomWeighted * (max - min + 1)) + min;
}

client.once('ready', () => {
    console.log(`Conectado como ${client.user.tag}`);
});

// ================= LOGS DE LLAMADAS Y CANALES DE VOZ =================
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
            .setTitle('🔇 Voz: Usuario desconectado')
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

// ================= LOGS DE INVITACIONES =================
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
    const embed = new EmbedBuilder()
        .setTitle('📥 Usuario unido')
        .setColor('#2ecc71')
        .setDescription(`**${member.user.tag}** se ha unido al servidor.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields({ name: '🆔 ID', value: `\`${member.id}\``, inline: true })
        .setTimestamp();

    await sendLog(member.guild, embed);

    const welcomeEmbed = new EmbedBuilder()
        .setTitle('👋 Bienvenido')
        .setColor('#f1c40f')
        .setDescription(`Hola ${member}, bienvenido al servidor. Esperamos que disfrutes tu estancia.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
    
    if (member.guild.systemChannel) {
        member.guild.systemChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
    }
});

client.on('guildMemberRemove', async (member) => {
    const embed = new EmbedBuilder()
        .setTitle('📤 Usuario salido')
        .setColor('#e74c3c')
        .setDescription(`**${member.user.tag}** ha salido del servidor.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields({ name: '🆔 ID', value: `\`${member.id}\``, inline: true })
        .setTimestamp();

    await sendLog(member.guild, embed);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const embed = new EmbedBuilder()
            .setTitle('🚀 Nuevo Boost')
            .setColor('#9b59b6')
            .setDescription(`**${newMember.user.tag}** ha potenciado el servidor. ¡Gracias por tu apoyo!`)
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        await sendLog(newMember.guild, embed);
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

// ================= COMANDOS =================
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
            .setTitle('👋 Bienvenido')
            .setColor('#f1c40f')
            .setDescription(`Hola ${message.author}, bienvenido al servidor. Esperamos que disfrutes tu estancia.`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }));
        return message.channel.send({ embeds: [embed] });
    }

    if (command === '.boost') {
        const embed = new EmbedBuilder()
            .setTitle('🚀 Nuevo Boost')
            .setColor('#9b59b6')
            .setDescription(`**${message.author.tag}** ha potenciado el servidor. ¡Gracias por tu apoyo!`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }));
        return message.channel.send({ embeds: [embed] });
    }

    // Setup de tickets
    if (command === '!ticket-setup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
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

        // Comando kaponi ping
        if (subCommand === 'ping') {
            const msg = await message.channel.send('🏓 Calculando latencia...');
            const latency = msg.createdTimestamp - message.createdTimestamp;
            const apiLatency = Math.round(client.ws.ping);
            return msg.edit(`🏓 Pong! Latencia del bot: **${latency}ms** | API: **${apiLatency}ms**`);
        }

        // Comando kaponi banana (de 1 a 32cm)
        if (subCommand === 'banana') {
            const targetUser = message.mentions.users.first() || message.author;
            const size = getRandomBananaSize();

            const embed = new EmbedBuilder()
                .setTitle('🍌 Tamaño de Banana')
                .setColor('#f1c40f')
                .setDescription(`La banana de ${targetUser} mide **${size}cm** 🍌`)
                .setImage('https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&auto=format&fit=crop&q=60');

            return message.channel.send({ embeds: [embed] });
        }

        if (!subCommand || !['ban', 'mute', 'kick'].includes(subCommand)) {
            return;
        }

        // Verificación de permisos de administración para moderación
        const requiredPermission = 
            subCommand === 'ban' ? PermissionFlagsBits.BanMembers :
            subCommand === 'kick' ? PermissionFlagsBits.KickMembers : PermissionFlagsBits.ModerateMembers;

        if (!message.member.permissions.has(requiredPermission)) {
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
                if (targetMember.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
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

        // --- MUTE / TIMEOUT ---
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
            if (targetMember.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
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
            if (targetMember.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
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

// ================= SISTEMA DE TICKETS =================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

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
});

client.login(process.env.TOKEN);
