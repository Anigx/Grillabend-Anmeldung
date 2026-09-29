const { createApp } = require('./src/server');

if (require.main === module) {
    createApp().then(({ app }) => {
        const port = Number(process.env.PORT || 621);
        if (process.env.NODE_ENV === 'production') {
            app.listen(port, '127.0.0.1', () => console.log(`Grillabend hinter HTTPS-Proxy auf 127.0.0.1:${port}`));
        } else {
            app.listen(port, () => console.log(`Grillabend läuft auf http://localhost:${port}`));
        }
    }).catch(error => {
        console.error('Start fehlgeschlagen:', error);
        process.exitCode = 1;
    });
}

module.exports = { createApp };
