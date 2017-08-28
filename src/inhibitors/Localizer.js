const { Inhibitor } = require('discord-akairo');

function exec(message) {

    if (message.guild) {
        const locale = this.client.databases.guilds.get(message.guild.id, 'locale', 'en');
    } else {
        const locale = 'en';
    }


    this.client.localize.setLocale(locale);
    message.locale = locale;
}

module.exports = new Inhibitor('localizer', exec, {
    reason: 'localized'
});
