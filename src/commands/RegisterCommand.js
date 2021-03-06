const Command = require('../PlatronCommand');
const request = require('request-promise');
const cheerio = require('cheerio');
const winston = require('winston');

class RegisterCommand extends Command {
    constructor() {
        super('register', {
            aliases: ['register'],
            args: [
                {
                    id: 'user',
                    type: 'citizenId',
                    match: 'rest'
                }
            ],
            description: () => {
                return this.client._('command.register.description');
            },
            usage: [
                'register <citizen_id>',
                'register <citizen_name>'
            ]
        });
    }

    async verifyCode(citizenId, code) {
        if (!code) {
            return null;
        }

        if (code.length !== 5) {
            return null;
        }

        const body = await request.get(`https://www.erepublik.com/en/citizen/profile/${citizenId}`);
        const about_me = cheerio.load(body)('.about_message.profile_section').text();
        const regex = new RegExp(`\\[tron\\=(${code})\\]`);

        return !!about_me.match(regex);
    }

    generateCode() {
        return (Math.random() + 1).toString(36).substr(2, 5);
    }

    async exec(message, args) {
        if (!args.user) {
            return this.client.platron_utils.invalidCommand(message, this);
        }

        winston.info('Attempting to register', args.user);

        const Citizen = this.client.databases.citizens.table;

        // Finding citizen with the provided ID in the db
        const user = await Citizen.findById(args.user);
        // If the user was found
        if (user) {
            winston.verbose('Found citizen with id', user.id);
            if ((user.verified === false && user.discord_id == message.author.id) || user.reclaiming == message.author.id) {
                const verify = await this.verifyCode(user.id, user.code);

                // If code is in the about me page
                if (verify) {
                    const exists = await Citizen.findOne({
                        where: {
                            discord_id: message.author.id
                        }
                    });

                    if (exists) {
                        winston.verbose('User', user.id, 'already registered. Deleting old account');
                        await exists.destroy();
                    }

                    winston.verbose('Successfully verified code for', user.id);
                    user.verified = true;
                    user.code = null;
                    user.discord_id = message.author.id;
                    user.reclaiming = null;

                    await user.save();
                    this.client.platron_utils.addRoles(message.member, user, message.guild);

                    const l_verified = this.client._('command.register.verified', `**${args.user}**`);
                    const l_verified1 = this.client._('command.register.verified1');

                    await message.reply(`:white_check_mark: ${l_verified}\n ${l_verified1} :thumbsup:`);
                } else if (verify === false) {
                    winston.warn('Code didn\'t match for', args.user);
                    // If code doesn't match
                    await message.reply(this.client._('command.register.add_code', `**${args.user}**`, `\`[tron=${user.code}]\``));
                } else {
                    winston.warn('Code invalid for', args.user);
                    // If invalid code
                    const code = this.generateCode();
                    user.code = code;
                    user.discord_id = message.author.id;
                    await user.save();

                    await message.reply(`:arrows_counterclockwise: Something went wrong! Please add \`[tron=${code}]\` to your **About me** section and try again`);
                }
            } else {
                const owner = this.client.util.resolveUser(user.discord_id, this.client.users);

                if (!owner) {
                    winston.warn(`Did not find user with ID ${user.discord_id} when registering ${args.user}. Deleting this record`);
                    await user.destroy();
                    return this.exec(message, args);
                }

                if (owner.id == message.author.id) {
                    await message.reply(`:white_check_mark: ${this.client._('command.register.already_verified')}!`);
                    return;
                }

                const l_already_claimed = this.client._('command.register.already_claimed', `\`${args.user}\``, `<@${owner.id}>\n:arrows_counterclockwise: __`);
                const l_options = this.client._('bot.prompt.options', '**yes**', '**no**');

                try {
                    const prompt = await this.client.util.prompt(
                        message,
                        `${l_already_claimed}?__ (${l_options})`,
                        () => true,
                        30000,
                        {
                            reply: message.author
                        }
                    );

                    if (prompt.content.startsWith('y')) {
                        const code = this.generateCode();
                        user.reclaiming = message.author.id;
                        user.code = code;
                        await user.save();
                        await message.reply(`Ok :ok_hand:. ${this.client._('command.register.add_code', `**${args.user}**`, `\`[tron=${code}]\``)}`);
                    }
                } catch (e) {
                    if (e == 'time') {
                        await message.reply('Oops... reply time has ran out');
                    }
                }
            }
        // If the user wasnt found in the database
        } else {
            const exists = await Citizen.findOne({
                where: {
                    discord_id: message.author.id
                }
            });

            if (exists) {
                const l_options = this.client._('bot.prompt.options', '**yes**', '**no**');

                try {
                    const prompt = await this.client.util.prompt(
                        message,
                        `You already own ${exists.id}. Would you like to remove it? (${l_options})`,
                        () => true,
                        30000,
                        {
                            reply: message.author
                        }
                    );

                    if (prompt.content.startsWith('y')) {
                        await Citizen.destoy({
                            where: {
                                discord_id: message.author.id
                            }
                        });
                    }
                } catch (e) {
                    if (e == 'time') {
                        await message.reply('Oops... reply time has ran out');
                    }
                }
            }

            winston.verbose('Generating code for', args.user);
            const code = this.generateCode();
            await Citizen.create({
                id: args.user,
                discord_id: message.author.id,
                code: code
            });

            const l_add_code = this.client._('command.register.add_code', `**${args.user}**`, `\`[tron=${code}]\``);
            await message.reply(`:information_source: ${l_add_code}.`);
        }
    }
}

module.exports = RegisterCommand;
