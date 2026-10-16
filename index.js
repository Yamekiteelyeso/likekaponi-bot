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
        GatewayIntentBits.GuildInvites
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

// ID del canal de logs integrado directamente
const LOG_CHANNEL_ID = '1560757735866507274';

// Webhook opcional desde variables de entorno
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const webhookClient = WEBHOOK_URL ? new WebhookClient({ url: WEBHOOK_URL }) : null;

// Función para enviar logs al canal y/o al Webhook
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

// Auxiliar para parsear tiempos (1s, 5m, 2h, 1d)
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

client.once('ready', () => {
    console.log(`Conectado como ${client.user.tag}`);
});

// ================= EVENTOS DE ENTRADA / SALIDA / BOOST =================
client.on('guildMemberAdd', async (member) => {
    const embed = new EmbedBuilder()
        .setTitle('Usuario unido')
        .setDescription(`**${member.user.tag}** se ha unido al servidor.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields({ name: 'ID', value: member.id, inline: true })
        .setTimestamp();

    await sendLog(member.guild, embed);

    const welcomeEmbed = new EmbedBuilder()
        .setTitle('Bienvenido')
        .setDescription(`Hola ${member}, bienvenido al servidor. Esperamos que disfrutes tu estancia.`);
    
    if (member.guild.systemChannel) {
        member.guild.systemChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
    }
});

client.on('guildMemberRemove', async (member) => {
    const embed = new EmbedBuilder()
        .setTitle('Usuario salido')
        .setDescription(`**${member.user.tag}** ha salido del servidor.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields({ name: 'ID', value: member.id, inline: true })
        .setTimestamp();

    await sendLog(member.guild, embed);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const embed = new EmbedBuilder()
            .setTitle('Nuevo Boost')
            .setDescription(`**${newMember.user.tag}** ha potenciado el servidor. ¡Gracias!`)
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        await sendLog(newMember.guild, embed);
    }
});

// ================= LOGS: INVITACIONES Y MENSAJES BORRADOS =================
client.on('inviteCreate', async (invite) => {
    const embed = new EmbedBuilder()
        .setTitle('Invitación creada')
        .addFields(
            { name: 'Creador', value: invite.inviter ? invite.inviter.tag : 'Desconocido', inline: true },
            { name: 'Código', value: invite.code, inline: true },
            { name: 'Canal', value: `<#${invite.channel.id}>`, inline: true }
        )
        .setTimestamp();

    await sendLog(invite.guild, embed);
});

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
    } catch (err) {
        // Faltan permisos de auditoría
    }

    const embed = new EmbedBuilder()
        .setTitle('Mensaje borrado')
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'Usuario', value: `${message.author.tag} (${message.author.id})`, inline: false },
            { name: 'Canal', value: `<#${message.channel.id}>`, inline: false },
            { name: 'Contenido', value: message.content || '[Sin texto / Solo contenido multimedia]', inline: false },
            { name: 'Borrado por', value: deletedBy, inline: false }
        )
        .setTimestamp();

    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        embed.setImage(attachment.url);
        embed.addFields({ name: 'Adjunto', value: 'El mensaje contenía una foto o archivo.', inline: false });
    }

    await sendLog(message.guild, embed);
});

// ================= COMANDOS =================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Pruebas
    if (command === '!bienvenida') {
        const embed = new EmbedBuilder()
            .setTitle('Bienvenido')
            .setDescription(`Hola ${message.author}, bienvenido al servidor. Esperamos que disfrutes tu estancia.`);
        return message.channel.send({ embeds: [embed] });
    }

    if (command === '!boost') {
        const embed = new EmbedBuilder()
            .setTitle('Nuevo Boost')
            .setDescription(`**${message.author.tag}** ha potenciado el servidor. ¡Gracias!`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }));
        return message.channel.send({ embeds: [embed] });
    }

    // Setup de tickets
    if (command === '!ticket-setup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('No tienes permisos de administrador para usar este comando.');
        }

        const embed = new EmbedBuilder()
            .setTitle('Soporte de Tickets')
            .setDescription('Haz clic en el botón de abajo para abrir un ticket de soporte privado.');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_ticket')
                .setLabel('Crear Ticket')
                .setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        return message.delete().catch(() => {});
    }

    // Moderación: kaponi ban / mute / kick
    if (command === 'kaponi') {
        const subCommand = args.shift()?.toLowerCase();
        const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!subCommand) return message.reply('Uso correcto: kaponi [ban/mute/kick] @usuario [tiempo/razón]');

        if (subCommand === 'ban') {
            if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
                return message.reply('No tienes permisos para banear.');
            }
            if (!target) return message.reply('Debes mencionar a un usuario válido.');

            const reason = args.slice(1).join(' ') || 'Sin razón especificada';
            try {
                await target.ban({ reason });
                message.channel.send(`Usuario ${target.user.tag} baneado correctamente.`);
                
                const logEmbed = new EmbedBuilder()
                    .setTitle('Sanción: Ban')
                    .addFields(
                        { name: 'Usuario', value: target.user.tag, inline: true },
                        { name: 'Moderador', value: message.author.tag, inline: true },
                        { name: 'Razón', value: reason, inline: false }
                    )
                    .setTimestamp();
                await sendLog(message.guild, logEmbed);
            } catch (err) {
                message.reply('No se pudo banear al usuario.');
            }
        } 
        else if (subCommand === 'mute') {
            if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                return message.reply('No tienes permisos para silenciar.');
            }
            if (!target) return message.reply('Debes mencionar a un usuario válido.');

            const timeArg = args[1];
            const duration = parseTime(timeArg);
            const reason = args.slice(2).join(' ') || 'Sin razón especificada';

            if (!duration) {
                return message.reply('Especifica un tiempo válido para el mute (ej. `1s`, `5m`, `2h`, `1d`).');
            }

            try {
                await target.timeout(duration, reason);
                message.channel.send(`Usuario ${target.user.tag} silenciado por ${timeArg}.`);

                const logEmbed = new EmbedBuilder()
                    .setTitle('Sanción: Mute / Timeout')
                    .addFields(
                        { name: 'Usuario', value: target.user.tag, inline: true },
                        { name: 'Moderador', value: message.author.tag, inline: true },
                        { name: 'Duración', value: timeArg, inline: true },
                        { name: 'Razón', value: reason, inline: false }
                    )
                    .setTimestamp();
                await sendLog(message.guild, logEmbed);
            } catch (err) {
                message.reply('No se pudo silenciar al usuario.');
            }
        } 
        else if (subCommand === 'kick') {
            if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                return message.reply('No tienes permisos para expulsar.');
            }
            if (!target) return message.reply('Debes mencionar a un usuario válido.');

            const reason = args.slice(1).join(' ') || 'Sin razón especificada';
            try {
                await target.kick(reason);
                message.channel.send(`Usuario ${target.user.tag} expulsado correctamente.`);

                const logEmbed = new EmbedBuilder()
                    .setTitle('Sanción: Kick')
                    .addFields(
                        { name: 'Usuario', value: target.user.tag, inline: true },
                        { name: 'Moderador', value: message.author.tag, inline: true },
                        { name: 'Razón', value: reason, inline: false }
                    )
                    .setTimestamp();
                await sendLog(message.guild, logEmbed);
            } catch (err) {
                message.reply('No se pudo expulsar al usuario.');
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
                    .setStyle(ButtonStyle.Danger)
            );

            const ticketEmbed = new EmbedBuilder()
                .setTitle(`Ticket de ${member.user.tag}`)
                .setDescription('Describe tu consulta o problema. Un miembro del equipo te atenderá pronto.');

            await channel.send({ content: `${member}`, embeds: [ticketEmbed], components: [closeRow] });
            await interaction.reply({ content: `Ticket creado: <#${channel.id}>`, ephemeral: true });
        } catch (err) {
            await interaction.reply({ content: 'Hubo un error al crear el ticket.', ephemeral: true });
        }
    }

    if (interaction.customId === 'close_ticket') {
        const channel = interaction.channel;
        await interaction.reply({ content: 'Cerrando ticket en 5 segundos...' });
        setTimeout(() => {
            channel.delete().catch(() => {});
        }, 5000);
    }
});

client.login(process.env.TOKEN);
