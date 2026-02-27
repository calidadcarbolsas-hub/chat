module.exports = {
    GOOGLE_CLIENT_EMAIL:    process.env.GOOGLE_CLIENT_EMAIL,
    // Las claves privadas vienen con \n literal desde .env; hay que convertirlas a saltos reales
    GOOGLE_PRIVATE_KEY:     process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID
};
