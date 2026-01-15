const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
require("dotenv").config(); // <--- ESTO ES LO NUEVO

const app = express();
app.use(bodyParser.json());

// --- AHORA USAMOS VARIABLES DE ENTORNO (PRIVADAS) ---
const TOKEN = process.env.META_TOKEN; 
const PHONE_ID = process.env.META_PHONE_ID; 
const VERIFY_TOKEN = process.env.VERIFY_TOKEN; 
const PORT = process.env.PORT || 3000; 
const DB_FILE = "database.json";
// --- FUNCIONES DE BASE DE DATOS (JSON) ---
function leerDB() {
    try {
        const data = fs.readFileSync(DB_FILE, "utf8");
        return JSON.parse(data);
    } catch (error) {
        return {}; // Si falla, retorna vacío
    }
}

function guardarDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 1. Servir la Interfaz Gráfica
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});

// 2. Endpoint para que el Frontend obtenga el historial real
app.get("/api/historial", (req, res) => {
    const db = leerDB();
    res.json(db);
});

// 3. API para ENVIAR mensajes
app.post("/api/enviar", async (req, res) => {
    const { telefono, tipo, contenido } = req.body;
    const url = `https://graph.facebook.com/v17.0/${PHONE_ID}/messages`;
    
    let db = leerDB();
    if (!db[telefono]) db[telefono] = []; // Crear chat si no existe

    let dataMeta;

    // Configurar payload para Meta
    if (tipo === "texto") {
        dataMeta = { messaging_product: "whatsapp", to: telefono, type: "text", text: { body: contenido } };
    } else if (tipo === "plantilla") {
        dataMeta = { messaging_product: "whatsapp", to: telefono, type: "template", template: { name: "hello_world", language: { code: "en_US" } } };
    }

    try {
        await axios.post(url, dataMeta, {
            headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" }
        });

        // GUARDAR EN BD LOCAL
        db[telefono].push({ 
            tipo: "out", 
            texto: contenido || "Plantilla Hello World", 
            hora: new Date().toLocaleTimeString() 
        });
        guardarDB(db);

        res.json({ success: true });
        console.log(`📤 Enviado a ${telefono}`);
    } catch (error) {
        console.error("Error enviando:", error.response ? error.response.data : error.message);
        res.json({ success: false });
    }
});

// 4. Webhook para RECIBIR mensajes
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
    const body = req.body;
    if (body.object) {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const mensaje = body.entry[0].changes[0].value.messages[0];
            const de = mensaje.from; // Número del cliente
            const texto = mensaje.text ? mensaje.text.body : "[Archivo Adjunto]";
            
            // GUARDAR EN BD LOCAL
            let db = leerDB();
            if (!db[de]) db[de] = [];
            
            db[de].push({ 
                tipo: "in", 
                texto: texto, 
                hora: new Date().toLocaleTimeString() 
            });
            guardarDB(db);

            console.log(`📩 Mensaje guardado de ${de}: ${texto}`);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

app.listen(PORT, () => console.log(`🟢 Servidor listo en puerto ${PORT}`));