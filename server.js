const { createApp } = require('./src/server');

if (require.main === module) {
    createApp().then(({ app }) => {
        const port = Number(process.env.PORT || 621);
        const host = process.env.HOST || '0.0.0.0';
        app.listen(port, host, () => console.log(`Grillabend lauscht auf ${host}:${port}`));
    }).catch(error => {
        console.error('Start fehlgeschlagen:', error);
        process.exitCode = 1;
    });
}

module.exports = { createApp };
