module.exports = {
    GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
    // Las claves privadas vienen con \n literal desde .env; hay que convertirlas a saltos reales
    GOOGLE_PRIVATE_KEY:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    // Tu correo personal para que la carpeta aparezca en tu Drive
    GOOGLE_OWNER_EMAIL:  process.env.GOOGLE_OWNER_EMAIL
};
